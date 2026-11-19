-- =====================================================================
-- BENDO BIO — Mise à jour 008 : espace LIVREUR + demandes d'accès à l'inscription
--  · Nouveau rôle « livreur » (courier) : voit les livraisons disponibles, en prend une
--    (elle disparaît alors chez les autres), la livre, encaisse ; historique personnel.
--  · À l'inscription : client / livreur / gestionnaire. Livreur et gestionnaire restent
--    « en attente » (compte client) jusqu'à validation par l'administrateur.
--  · Notifications livreurs : nouvelle livraison disponible, commande prête à récupérer.
-- À exécuter UNE fois après 007, dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- =====================================================================

alter type user_role add value if not exists 'courier';

alter table profiles add column if not exists requested_role text check (requested_role in ('courier','employee'));
alter table orders add column if not exists courier_id uuid references profiles(id) on delete set null;
alter table orders add column if not exists courier_claimed_at timestamptz;
create index if not exists orders_courier_idx on orders(courier_id);

create or replace function is_courier() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text = 'courier' from profiles where id = auth.uid() and active), false)
$$;

-- Personnel, ou livreur sur SA livraison pour les actions de livraison uniquement
create or replace function require_staff_or_courier(p_order uuid, p_action text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if is_staff() then return; end if;
  if is_courier()
     and exists (select 1 from orders where id = p_order and courier_id = auth.uid())
     and p_action in ('out_for_delivery','delivered','delivery_failed','event:nearby','payment') then
    return;
  end if;
  raise exception 'FORBIDDEN: action non autorisée pour votre rôle' using errcode = '42501';
end $$;

-- Inscription : on note le rôle demandé, mais tout le monde démarre « client »
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_req text := nullif(new.raw_user_meta_data->>'requested_role','');
begin
  if v_req not in ('courier','employee') then v_req := null; end if;
  insert into profiles (id, email, full_name, phone, marketing_consent, requested_role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'phone',
          coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, false), v_req)
  on conflict (id) do nothing;
  if v_req is not null then
    insert into notifications(event, recipient, channel, subject, body, status, sent_at)
    values ('role_request', 'admin', 'dashboard', 'Demande d''accès ' || case v_req when 'courier' then 'livreur' else 'gestionnaire' end,
            coalesce(new.raw_user_meta_data->>'full_name', new.email) || ' demande l''accès ' ||
            case v_req when 'courier' then 'livreur' else 'gestionnaire' end || '. À valider dans Gestion > Utilisateurs.', 'sent', now());
  end if;
  return new;
end $$;

-- Le rôle demandé ne peut pas être modifié par l'utilisateur lui-même (sauf pour l'annuler)
create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active
      or new.internal_notes is distinct from old.internal_notes
      or (new.requested_role is distinct from old.requested_role and new.requested_role is not null))
     and not is_admin() and not is_backend() and current_setting('bendo.internal', true) is distinct from '1' then
    if not (is_staff() and new.role = old.role and new.active = old.active and new.requested_role is not distinct from old.requested_role) then
      raise exception 'FORBIDDEN: modification du rôle réservée à l''administrateur';
    end if;
  end if;
  return new;
end $$;

-- Validation / refus par l'administrateur (efface la demande)
create or replace function admin_set_user(p_user uuid, p_role user_role, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if (p_role::text <> 'admin' or not p_active)
     and (select role::text from profiles where id = p_user) = 'admin'
     and (select count(*) from profiles where role::text = 'admin' and active) <= 1 then
    raise exception 'LAST_ADMIN: impossible de retirer le dernier administrateur';
  end if;
  update profiles set role = p_role, active = p_active, requested_role = null where id = p_user;
  insert into notifications(event, recipient, channel, subject, body, status, sent_at, user_id)
  values ('role_changed', null, 'app', 'Votre accès BENDO BIO',
          'Votre compte est maintenant : ' || case p_role::text when 'courier' then 'Livreur' when 'employee' then 'Gestionnaire'
            when 'admin' then 'Administrateur' else 'Client' end || case when p_active then '.' else ' (désactivé).' end,
          'sent', now(), p_user);
end $$;

create or replace function reject_role_request(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  update profiles set requested_role = null where id = p_user;
end $$;

-- ---------------------------------------------------------------------
-- Tableau du livreur
-- ---------------------------------------------------------------------
create or replace function courier_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if not (is_courier() or is_staff()) then raise exception 'FORBIDDEN: espace réservé aux livreurs' using errcode = '42501'; end if;
  return jsonb_build_object(
    -- livraisons libres : quartier, date, montants (adresse et téléphone masqués tant qu'elle n'est pas prise)
    'available', coalesce((select jsonb_agg(x order by x.slot_start) from (
        select o.id, o.order_number, o.status, o.address_postal_code as area, o.address_city as city,
               s.starts_at as slot_start, s.ends_at as slot_end, o.delivery_fee, o.subtotal, o.total,
               o.payment_status, (select count(*) from order_items i where i.order_id = o.id and not i.unavailable) as items
        from orders o left join slots s on s.id = o.slot_id
        where o.fulfillment = 'delivery' and o.courier_id is null
          and o.status in ('confirmed','preparing','ready','delivery_failed')
          and (s.ends_at is null or s.ends_at > now() - interval '1 day')) x), '[]'::jsonb),
    -- mes livraisons en cours et à venir (toutes les informations)
    'mine', coalesce((select jsonb_agg(x order by x.slot_start) from (
        select o.id, o.order_number, o.status, o.address_postal_code as area, o.address_city as city,
               o.address_street as street, o.address_instructions as instructions,
               coalesce(o.guest_name, pr.full_name) as customer, coalesce(o.guest_phone, pr.phone) as phone,
               s.starts_at as slot_start, s.ends_at as slot_end, o.delivery_fee, o.subtotal, o.total,
               o.payment_status, o.payment_method, o.customer_note, o.courier_claimed_at, o.departed_at,
               (select jsonb_agg(jsonb_build_object('name', i.product_name, 'qty', coalesce(i.actual_weight, i.quantity), 'unit', i.unit))
                  from order_items i where i.order_id = o.id and not i.unavailable) as items
        from orders o left join slots s on s.id = o.slot_id left join profiles pr on pr.id = o.customer_id
        where o.courier_id = v_me and (o.status in ('confirmed','preparing','ready','out_for_delivery','delivery_failed')
              or (o.status = 'delivered' and o.payment_status <> 'paid'))) x), '[]'::jsonb),
    -- historique : livraisons que j'ai effectuées
    'history', coalesce((select jsonb_agg(x order by x.delivered_at desc) from (
        select o.id, o.order_number, o.status, o.address_postal_code as area, o.delivered_at, o.received_by,
               o.delivery_fee, o.total, o.payment_status, o.failure_reason
        from orders o
        where o.courier_id = v_me and o.status in ('delivered','delivery_failed','refunded','partially_refunded')
        order by coalesce(o.delivered_at, o.updated_at) desc limit 200) x), '[]'::jsonb),
    'stats', (select jsonb_build_object(
        'delivered', count(*) filter (where status = 'delivered'),
        'fees', coalesce(sum(delivery_fee) filter (where status = 'delivered'), 0),
        'this_month', count(*) filter (where status = 'delivered' and delivered_at >= date_trunc('month', now())))
      from orders where courier_id = v_me));
end $$;

-- Prendre une livraison : atomique (un seul livreur gagne), disparaît pour les autres
create or replace function courier_claim(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if not is_courier() then raise exception 'FORBIDDEN: réservé aux livreurs' using errcode = '42501'; end if;
  update orders set courier_id = auth.uid(), courier_claimed_at = now()
  where id = p_order and courier_id is null and fulfillment = 'delivery'
    and status in ('confirmed','preparing','ready','delivery_failed')
  returning * into o;
  if not found then raise exception 'ALREADY_TAKEN: cette livraison vient d''être prise par un autre livreur'; end if;
  insert into order_status_history(order_id, from_status, to_status, note, user_id)
  values (o.id, o.status, o.status, 'Livraison prise en charge par ' || coalesce((select full_name from profiles where id = auth.uid()), 'un livreur'), auth.uid());
end $$;

-- Rendre une livraison (avant le départ)
create or replace function courier_release(p_order uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (is_staff() or (is_courier() and o.courier_id = auth.uid())) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if o.status = 'out_for_delivery' then raise exception 'INVALID_STATE: livraison déjà en cours'; end if;
  update orders set courier_id = null, courier_claimed_at = null where id = p_order;
  insert into order_status_history(order_id, from_status, to_status, note, user_id)
  values (o.id, o.status, o.status, 'Livreur retiré' || coalesce(' : ' || nullif(trim(p_reason),''), ''), auth.uid());
end $$;

-- Attribution manuelle par l'équipe
create or replace function assign_courier(p_order uuid, p_courier uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  perform require_staff();
  if (select status from orders where id = p_order) = 'out_for_delivery' then
    raise exception 'INVALID_STATE: livraison en cours, réattribution impossible';
  end if;
  if p_courier is not null and not exists (select 1 from profiles where id = p_courier and role::text = 'courier' and active) then
    raise exception 'INVALID_COURIER: ce compte n''est pas un livreur actif';
  end if;
  update orders set courier_id = p_courier, courier_claimed_at = case when p_courier is null then null else now() end
  where id = p_order returning * into o;
  if p_courier is not null then
    insert into notifications(event, recipient, channel, order_id, subject, body, status, sent_at, user_id)
    values ('courier_assigned', null, 'app', o.id, 'Livraison attribuée : ' || o.order_number,
            'Quartier ' || coalesce(o.address_postal_code,'?') || ' — frais ' || trim_scale(o.delivery_fee) || ' ' || o.currency || '.', 'sent', now(), p_courier);
  end if;
end $$;

-- Notifications automatiques aux livreurs (« Ding ! »)
create or replace function orders_courier_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_slot text;
begin
  if new.fulfillment <> 'delivery' then return new; end if;
  select to_char(s.starts_at at time zone shop_tz(), 'DD/MM HH24:MI') into v_slot from slots s where s.id = new.slot_id;
  -- nouvelle livraison disponible
  if new.status = 'confirmed' and new.courier_id is null and (tg_op = 'INSERT' or old.status is distinct from 'confirmed')
     and not exists (select 1 from notifications n where n.order_id = new.id and n.event = 'courier_new') then
    insert into notifications(event, recipient, channel, order_id, subject, body, status, sent_at, user_id)
    select 'courier_new', null, 'app', new.id, 'Nouvelle livraison : ' || coalesce(new.address_postal_code, 'Pointe-Noire'),
           'Créneau ' || coalesce(v_slot,'?') || ' — frais de livraison ' || trim_scale(new.delivery_fee) || ' ' || new.currency
           || ', marchandise ' || trim_scale(new.subtotal) || ' ' || new.currency || '. Prenez-la dans votre espace livreur.', 'sent', now(), p.id
    from profiles p where p.role::text = 'courier' and p.active;
  end if;
  -- commande prête : « venez la récupérer »
  if new.status = 'ready' and old.status is distinct from 'ready' then
    insert into notifications(event, recipient, channel, order_id, subject, body, status, sent_at, user_id)
    select 'courier_ready', null, 'app', new.id, '🔔 Commande ' || new.order_number || ' prête',
           case when new.courier_id is null then 'Prête à être livrée (' || coalesce(new.address_postal_code,'?') || ') — prenez-la dans votre espace livreur.'
                else 'Vous pouvez venir la récupérer à Ngoyo centrale (créneau ' || coalesce(v_slot,'?') || ').' end,
           'sent', now(), p.id
    from profiles p where p.role::text = 'courier' and p.active and (new.courier_id is null or p.id = new.courier_id);
  end if;
  -- livraison annulée alors qu'un livreur l'avait prise : le prévenir
  if new.status in ('cancelled','refunded') and old.status is distinct from new.status and new.courier_id is not null then
    insert into notifications(event, recipient, channel, order_id, subject, body, status, sent_at, user_id)
    values ('courier_cancelled', null, 'app', new.id, '❌ Livraison annulée : ' || new.order_number,
            'Ne pas récupérer ni livrer cette commande (' || coalesce(new.address_postal_code,'?') || ').', 'sent', now(), new.courier_id);
  end if;
  return new;
end $$;
drop trigger if exists orders_courier_notify on orders;
create trigger orders_courier_notify after insert or update of status on orders for each row execute function orders_courier_notify();

-- Actions de livraison ouvertes au livreur sur SA commande
create or replace function set_order_status(p_order uuid, p_status order_status, p_note text default null,
  p_restock boolean default null, p_received_by text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; v_ok boolean; v_restock boolean; v_label text; v_tz text := shop_tz(); v_body text;
begin
  perform require_staff_or_courier(p_order, p_status::text);
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND: commande'; end if;
  if o.status = p_status then return; end if;

  v_ok := case o.status
    when 'pending_payment'  then p_status in ('cancelled')
    when 'confirmed'        then p_status in ('preparing','cancelled')
    when 'preparing'        then p_status in ('ready','out_for_delivery','cancelled','confirmed')
    when 'ready'            then p_status in ('delivered','out_for_delivery','cancelled','preparing')
    when 'out_for_delivery' then p_status in ('delivered','delivery_failed')
    when 'delivery_failed'  then p_status in ('out_for_delivery','ready','cancelled','refunded')
    when 'delivered'        then p_status in ('refunded','partially_refunded')
    when 'cancelled'        then p_status in ('refunded')
    when 'partially_refunded' then p_status in ('refunded')
    else false end;
  if not v_ok then
    raise exception 'INVALID_TRANSITION: passage de « % » à « % » non autorisé', o.status, p_status;
  end if;
  if p_status = 'out_for_delivery' and o.fulfillment <> 'delivery' then
    raise exception 'INVALID_TRANSITION: commande en retrait, pas de livraison';
  end if;
  if p_status in ('cancelled','delivery_failed','refunded','partially_refunded')
     and coalesce(length(trim(p_note)),0) < 3 then
    raise exception 'REASON_REQUIRED: motif obligatoire';
  end if;

  if p_status = 'cancelled' and o.stock_committed then
    if o.status <> 'confirmed' and p_restock is null then
      raise exception 'RESTOCK_DECISION_REQUIRED: indiquez si les produits sont remis en vente';
    end if;
    v_restock := case when o.status = 'confirmed' then true else p_restock end;
    if v_restock then perform restock_order(p_order, 'Annulation ' || o.order_number || ' : ' || p_note); end if;
  end if;

  update orders set status = p_status,
    departed_at = case when p_status = 'out_for_delivery' then now() else departed_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    received_by = case when p_status = 'delivered' then nullif(trim(p_received_by),'') else received_by end,
    failure_reason = case when p_status = 'delivery_failed' then p_note else failure_reason end,
    cancel_reason = case when p_status = 'cancelled' then p_note else cancel_reason end,
    payment_status = case when p_status = 'refunded' then 'refunded'
                          when p_status = 'partially_refunded' then 'partially_refunded' else payment_status end,
    reserved_until = case when p_status = 'cancelled' then null else reserved_until end,
    assigned_to = coalesce(assigned_to, case when p_status in ('preparing','out_for_delivery') then auth.uid() end)
  where id = p_order;

  insert into order_status_history(order_id, from_status, to_status, note, user_id)
  values (p_order, o.status, p_status,
          case when p_status = 'delivered' and nullif(trim(p_received_by),'') is not null
               then concat_ws(' — ', 'Remise à : ' || trim(p_received_by), nullif(p_note,'')) else p_note end, auth.uid());

  if p_status in ('preparing','ready','out_for_delivery','delivered','cancelled','delivery_failed','refunded','partially_refunded') then
    v_label := case p_status
      when 'preparing' then 'en préparation (vérifiée par nos agents)'
      when 'ready' then case when o.fulfillment = 'pickup' then 'prête au retrait' else 'prête' end
      when 'out_for_delivery' then 'en cours de livraison' when 'delivered' then 'livrée / retirée'
      when 'cancelled' then 'annulée' when 'delivery_failed' then 'livraison impossible'
      when 'refunded' then 'remboursée' else 'partiellement remboursée' end;
    v_body := case
      when p_status = 'delivered' then
        case when o.fulfillment = 'pickup' then 'Retirée' else 'Livrée' end
        || ' le ' || to_char(now() at time zone v_tz, 'DD/MM/YYYY') || ' à ' || to_char(now() at time zone v_tz, 'HH24:MI')
        || coalesce(' — remise à : ' || nullif(trim(p_received_by),''), '')
        || coalesce('. ' || nullif(trim(p_note),''), '') || '. Merci pour votre confiance !'
      when p_status = 'preparing' then 'Nos agents préparent et vérifient vos produits.' || coalesce(' ' || nullif(trim(p_note),''), '')
      when p_status = 'out_for_delivery' then 'Votre commande est partie en livraison.' || coalesce(' ' || nullif(trim(p_note),''), '')
      when p_status = 'ready' and o.fulfillment = 'pickup' then 'Votre commande vous attend à notre point de retrait.' || coalesce(' ' || nullif(trim(p_note),''), '')
      else coalesce(p_note, '') end;
    perform enqueue_order_notification(p_order, 'status_' || p_status,
      'Commande ' || o.order_number || ' : ' || v_label, v_body);
  end if;
end $$;

create or replace function notify_order_event(p_order uuid, p_event text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; v_subject text; v_body text; v_label text;
begin
  perform require_staff_or_courier(p_order, 'event:' || p_event);
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND: commande'; end if;
  if p_event = 'nearby' then
    if o.status <> 'out_for_delivery' then raise exception 'INVALID_STATE: la commande doit être « en livraison »'; end if;
    v_label := 'Livreur dans votre quartier';
    v_subject := 'Commande ' || o.order_number || ' : le livreur arrive';
    v_body := 'Notre livreur est dans votre quartier' || coalesce(' (' || o.address_postal_code || ')', '')
              || '. Merci de rester joignable au téléphone.' || coalesce(' ' || nullif(trim(p_note),''), '');
  elsif p_event = 'message' then
    if coalesce(length(trim(p_note)),0) < 3 then raise exception 'REASON_REQUIRED: message vide'; end if;
    v_label := 'Message envoyé au client';
    v_subject := 'Commande ' || o.order_number || ' : message de BENDO BIO';
    v_body := trim(p_note);
  else
    raise exception 'INVALID_EVENT';
  end if;
  insert into order_status_history(order_id, from_status, to_status, note, user_id)
  values (p_order, o.status, o.status, v_label || coalesce(' — ' || nullif(trim(p_note),''), ''), auth.uid());
  perform enqueue_order_notification(p_order, p_event, v_subject, v_body);
end $$;

create or replace function confirm_payment(p_order uuid, p_provider text default 'manual',
  p_external_ref text default null, p_amount numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o orders; v_ref text;
begin
  -- personnel connecté, OU clé serveur (webhook prestataire), OU tâche interne (SQL Editor / pg_cron)
  if auth.uid() is not null then perform require_staff_or_courier(p_order, 'payment');
  elsif coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role',
                 current_setting('request.jwt.claim.role', true), '') = 'service_role' then null;
  elsif session_user = 'authenticator' or coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role',
                 current_setting('request.jwt.claim.role', true), '') in ('anon','authenticated') then
    raise exception 'FORBIDDEN: accès réservé au personnel' using errcode = '42501';
  end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND: commande'; end if;
  v_ref := coalesce(nullif(p_external_ref,''), 'manual-' || o.order_number);
  if exists (select 1 from payments where provider = p_provider and external_ref = v_ref and status = 'succeeded') then
    return jsonb_build_object('status', o.status, 'payment_status', o.payment_status, 'duplicate', true);
  end if;
  if o.status in ('cancelled','refunded') then
    raise exception 'ORDER_CANCELLED: commande annulée — rembourser le client si un paiement a été reçu';
  end if;
  insert into payments(order_id, provider, external_ref, amount, currency, status, recorded_by)
  values (p_order, p_provider, v_ref, coalesce(p_amount, o.total), o.currency, 'succeeded', auth.uid());
  if o.status = 'pending_payment' then
    perform commit_order_stock(p_order);   -- revérifie le stock si la réservation a expiré
    update orders set status = 'confirmed', payment_status = 'paid' where id = p_order;
    insert into order_status_history(order_id, from_status, to_status, note, user_id)
    values (p_order, 'pending_payment', 'confirmed', 'Paiement confirmé (' || p_provider || ')', auth.uid());
    perform enqueue_order_notification(p_order, 'order_confirmed', 'Votre commande ' || o.order_number || ' est confirmée',
      'Paiement reçu. Nous préparons votre commande.');
  else
    update orders set payment_status = 'paid' where id = p_order;
    insert into order_status_history(order_id, from_status, to_status, note, user_id)
    values (p_order, o.status, o.status, 'Paiement reçu : ' || trim_scale(coalesce(p_amount, o.total)) || ' ' || o.currency
            || ' (' || case p_provider when 'mobile_money' then 'mobile money' when 'especes' then 'espèces' when 'manual' then 'enregistré' else p_provider end
            || coalesce(', réf. ' || nullif(p_external_ref,''), '') || ')', auth.uid());
    perform enqueue_order_notification(p_order, 'payment_received', 'Paiement reçu — commande ' || o.order_number,
      'Nous avons bien reçu votre paiement de ' || trim_scale(coalesce(p_amount, o.total)) || ' ' || o.currency
      || case when o.status in ('confirmed','preparing','ready') then ' (paiement anticipé, avant la livraison)' else '' end
      || '. Merci !');
  end if;
  return jsonb_build_object('status', (select status from orders where id = p_order), 'payment_status', 'paid', 'duplicate', false);
end $$;

-- Les notifications des livreurs ne doivent pas apparaître côté client (elles ont leur propre user_id)
-- Droits
grant execute on function courier_board() to authenticated;
grant execute on function courier_claim(uuid) to authenticated;
grant execute on function courier_release(uuid, text) to authenticated;
grant execute on function assign_courier(uuid, uuid) to authenticated;
grant execute on function reject_role_request(uuid) to authenticated;
grant execute on function is_courier() to authenticated;
revoke execute on function courier_board() from public, anon;
revoke execute on function courier_claim(uuid) from public, anon;
revoke execute on function courier_release(uuid, text) from public, anon;
revoke execute on function assign_courier(uuid, uuid) from public, anon;
revoke execute on function reject_role_request(uuid) from public, anon;
revoke execute on function admin_set_user(uuid, user_role, boolean) from public, anon;
grant execute on function admin_set_user(uuid, user_role, boolean) to authenticated;
revoke execute on function require_staff_or_courier(uuid, text) from public, anon, authenticated;
revoke execute on function orders_courier_notify() from public, anon, authenticated;
notify pgrst, 'reload schema';
