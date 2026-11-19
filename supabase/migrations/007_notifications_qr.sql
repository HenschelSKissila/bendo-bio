-- =====================================================================
-- BENDO BIO — Mise à jour 007 : notifications clients, suivi de livraison, QR traçabilité
--  · Centre de notifications dans le compte client (temps réel) pour chaque étape
--  · Étape « livreur dans votre quartier » ; nom de la personne qui a reçu la commande,
--    date et heure de remise enregistrées automatiquement
--  · Notification « paiement reçu » (y compris paiement anticipé avant livraison)
--  · Page publique de traçabilité d'un lot (QR code des étiquettes)
-- À exécuter UNE fois dans Supabase > SQL Editor (après 006). Ré-exécutable sans risque.
-- =====================================================================

alter table orders add column if not exists received_by text;
alter table notifications add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table notifications add column if not exists read_at timestamptz;
alter table notifications drop constraint if exists notifications_channel_check;
alter table notifications add constraint notifications_channel_check check (channel in ('email','sms','whatsapp','dashboard','app'));
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);

-- Le client voit ses propres notifications (et seulement les siennes)
drop policy if exists notif_own_read on notifications;
create policy notif_own_read on notifications for select using (user_id = auth.uid());

-- Chaque événement de commande : notification e-mail (si adresse) + notification dans le compte client
create or replace function enqueue_order_notification(p_order uuid, p_event text, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; v_to text;
begin
  select * into o from orders where id = p_order;
  select coalesce(pr.email, o.guest_email) into v_to from orders x left join profiles pr on pr.id = x.customer_id where x.id = p_order;
  insert into notifications(event, recipient, channel, order_id, subject, body, status)
  values (p_event, v_to, 'email', p_order, p_subject, p_body, case when v_to is null then 'skipped' else 'pending' end);
  if o.customer_id is not null then
    insert into notifications(event, recipient, channel, order_id, subject, body, status, sent_at, user_id)
    values (p_event, v_to, 'app', p_order, p_subject, p_body, 'sent', now(), o.customer_id);
  end if;
end $$;

create or replace function mark_notifications_read(p_id bigint default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id);
$$;

-- Nouvelle signature (ajout de « remis à ») : on retire l'ancienne pour éviter toute ambiguïté
drop function if exists set_order_status(uuid, order_status, text, boolean);
create or replace function set_order_status(p_order uuid, p_status order_status, p_note text default null,
  p_restock boolean default null, p_received_by text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; v_ok boolean; v_restock boolean; v_label text; v_tz text := shop_tz(); v_body text;
begin
  perform require_staff();
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

-- Événement de livraison sans changement de statut (ex. « livreur dans votre quartier »)
create or replace function notify_order_event(p_order uuid, p_event text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; v_subject text; v_body text; v_label text;
begin
  perform require_staff();
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
  if auth.uid() is not null then perform require_staff();
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

-- Suivi de commande (invités) : chronologie, date/heure et destinataire de la remise
create or replace function track_order(p_number text, p_contact text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'fulfillment', o.fulfillment,
    'total', o.total, 'currency', o.currency, 'created_at', o.created_at,
    'slot_start', s.starts_at, 'slot_end', s.ends_at, 'payment_status', o.payment_status,
    'delivered_at', o.delivered_at, 'received_by', o.received_by, 'departed_at', o.departed_at,
    'items', (select jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity, 'unit', unit, 'line_total', line_total, 'unavailable', unavailable))
              from order_items where order_id = o.id),
    'history', (select jsonb_agg(jsonb_build_object('to_status', h.to_status, 'note', h.note, 'created_at', h.created_at) order by h.created_at)
                from order_status_history h where h.order_id = o.id
                  and not (h.from_status = h.to_status and (h.note like 'Livreur retiré%' or h.note like 'Livraison prise en charge%'))))
  from orders o left join slots s on s.id = o.slot_id
  left join profiles pr on pr.id = o.customer_id
  where upper(o.order_number) = upper(trim(p_number))
    and (
      (position('@' in p_contact) > 0
        and lower(trim(p_contact)) in (lower(coalesce(o.guest_email,'#')), lower(coalesce(pr.email,'#'))))
      or (length(regexp_replace(p_contact,'\D','','g')) >= 6
        and right(regexp_replace(p_contact,'\D','','g'), 8) in (
              nullif(right(regexp_replace(coalesce(o.guest_phone,''),'\D','','g'), 8), ''),
              nullif(right(regexp_replace(coalesce(pr.phone,''),'\D','','g'), 8), '')))
    )
$$;

-- Page publique d'un lot (QR code de l'étiquette) : informations de traçabilité, sans stock ni prix d'achat
create or replace function lot_public(p_lot uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'lot_number', l.lot_number, 'received_at', l.received_at, 'expiry_date', l.expiry_date, 'expiry_kind', l.expiry_kind,
    'status', l.status, 'sellable', lot_is_sellable(l),
    'product', p.name, 'sku', p.sku, 'origin', p.origin, 'conservation', p.conservation,
    'allergens', p.allergens, 'organic', p.organic, 'image_url', p.image_url, 'product_id', p.id)
  from lots l join products p on p.id = l.product_id
  where l.id = p_lot
$$;

-- Temps réel : le client reçoit instantanément ses notifications
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;


-- =====================================================================
-- Notifications push sur le téléphone (Web Push), même site fermé
-- =====================================================================
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,     -- client invité : abonnement lié à sa commande
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists push_own on push_subscriptions;
create policy push_own on push_subscriptions for select using (user_id = auth.uid());
drop policy if exists push_own_delete on push_subscriptions;
create policy push_own_delete on push_subscriptions for delete using (user_id = auth.uid());
grant select, delete on push_subscriptions to authenticated;

-- Enregistre l'autorisation du téléphone (compte connecté, ou invité via n° de commande + téléphone)
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text,
  p_order_number text default null, p_contact text default null, p_user_agent text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  if coalesce(p_endpoint,'') !~ '^https://' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then
    raise exception 'INVALID_SUBSCRIPTION';
  end if;
  if auth.uid() is null then
    if track_order(p_order_number, p_contact) is null then
      raise exception 'NOT_FOUND: commande introuvable avec ces informations';
    end if;
    select id into v_order from orders where upper(order_number) = upper(trim(p_order_number));
  end if;
  insert into push_subscriptions(user_id, order_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), v_order, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    order_id = excluded.order_id,
    p256dh = excluded.p256dh, auth = excluded.auth;
  return 'ok';
end $$;

-- Paramètres privés (URL de la fonction d'envoi, secret partagé) — jamais lisibles par l'API
create table if not exists app_secrets (key text primary key, value text not null);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated;

do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then raise notice 'pg_net indisponible : notifications push désactivées';
end $$;

-- À chaque notification « app » (client) ou « dashboard » (équipe) : appel de la fonction d'envoi push.
-- Ne bloque jamais la commande en cas de problème (l'appel est asynchrone).
create or replace function push_notification_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if new.channel not in ('app','dashboard') then return new; end if;
  select value into v_url from app_secrets where key = 'push_function_url';
  select value into v_secret from app_secrets where key = 'push_webhook_secret';
  if v_url is null or v_secret is null then return new; end if;
  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('record', jsonb_build_object(
        'id', new.id, 'event', new.event, 'channel', new.channel, 'user_id', new.user_id,
        'order_id', new.order_id, 'subject', new.subject, 'body', new.body)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-bendo-secret', v_secret));
  exception when others then
    raise warning 'push non envoyé : %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists notifications_push on notifications;
create trigger notifications_push after insert on notifications for each row execute function push_notification_trigger();

-- Notifications « app » aussi pour les clients invités (envoyées sur le téléphone abonné à leur commande)
create or replace function enqueue_order_notification(p_order uuid, p_event text, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; v_to text;
begin
  select * into o from orders where id = p_order;
  select coalesce(pr.email, o.guest_email) into v_to from orders x left join profiles pr on pr.id = x.customer_id where x.id = p_order;
  insert into notifications(event, recipient, channel, order_id, subject, body, status)
  values (p_event, v_to, 'email', p_order, p_subject, p_body, case when v_to is null then 'skipped' else 'pending' end);
  insert into notifications(event, recipient, channel, order_id, subject, body, status, sent_at, user_id)
  values (p_event, v_to, 'app', p_order, p_subject, p_body, 'sent', now(), o.customer_id);
end $$;

grant execute on function save_push_subscription(text, text, text, text, text, text) to anon, authenticated;
revoke execute on function push_notification_trigger() from public, anon, authenticated;

-- Diagnostic (Paramètres) : l'envoi push est-il configuré ? combien d'appareils abonnés ?
create or replace function push_health() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff();
  return jsonb_build_object(
    'configured', exists (select 1 from app_secrets where key = 'push_function_url')
                  and exists (select 1 from app_secrets where key = 'push_webhook_secret'),
    'pg_net', exists (select 1 from pg_extension where extname = 'pg_net'),
    'devices', (select count(*) from push_subscriptions),
    'staff_devices', (select count(*) from push_subscriptions s join profiles p on p.id = s.user_id where p.role in ('employee','admin')));
end $$;
grant execute on function push_health() to authenticated;
revoke execute on function push_health() from public, anon;

-- Droits
revoke execute on function enqueue_order_notification(uuid, text, text, text) from public, anon, authenticated;
grant execute on function mark_notifications_read(bigint) to authenticated;
grant execute on function set_order_status(uuid, order_status, text, boolean, text) to authenticated;
grant execute on function notify_order_event(uuid, text, text) to authenticated;
grant execute on function track_order(text, text) to anon, authenticated;
grant execute on function lot_public(uuid) to anon, authenticated;
grant execute on function confirm_payment(uuid, text, text, numeric) to authenticated, service_role;
revoke execute on function set_order_status(uuid, order_status, text, boolean, text) from public, anon;
revoke execute on function notify_order_event(uuid, text, text) from public, anon;
revoke execute on function mark_notifications_read(bigint) from public, anon;
notify pgrst, 'reload schema';
