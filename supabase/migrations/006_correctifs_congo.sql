-- =====================================================================
-- BENDO BIO — Mise à jour 006 (à exécuter UNE fois sur une base déjà installée)
--  1. Corrige « La base de données n'est pas initialisée » à la réception de stock
--     et à la commande : sur Supabase, pgcrypto est dans le schéma "extensions"
--     → les numéros de lot / commande utilisent désormais gen_random_uuid() (intégré).
--  2. SQL Editor autorisé à corriger prix/rôles (l'API reste protégée).
--  3. Sécurité : confirm_payment n'est plus appelable par un visiteur anonyme.
--  4. Paramètres BENDO BIO Congo : contacts, FCFA, fuseau, Pointe-Noire.
--  5. Revue de code : poids réel → stock, ligne rétablie → déstockée, pas de quantité
--     imposé côté serveur, suivi de commande plus strict, demande RGPD liée au compte,
--     notifications tableau de bord non comptées « en attente ».
-- Script ré-exécutable sans risque.
-- =====================================================================

-- Fonctions corrigées (copie conforme de 002_functions.sql)
create or replace function is_backend() returns boolean
language sql stable as $$
  select auth.uid() is null and session_user <> 'authenticator'
     and coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role',
                  current_setting('request.jwt.claim.role', true), '') not in ('anon','authenticated')
$$;

create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active
      or new.internal_notes is distinct from old.internal_notes)
     and not is_admin() and not is_backend() and current_setting('bendo.internal', true) is distinct from '1' then
    if not (is_staff() and new.role = old.role and new.active = old.active) then
      raise exception 'FORBIDDEN: modification du rôle réservée à l''administrateur';
    end if;
  end if;
  return new;
end $$;

create or replace function guard_product_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and not is_backend() and (new.price is distinct from old.price
      or new.tax_rate is distinct from old.tax_rate
      or new.low_threshold is distinct from old.low_threshold
      or new.critical_threshold is distinct from old.critical_threshold) then
    raise exception 'FORBIDDEN: prix, taxes et seuils modifiables uniquement par l''administrateur';
  end if;
  return new;
end $$;

create or replace function open_alert(p_type text, p_level alert_level, p_msg text,
  p_product uuid default null, p_lot uuid default null, p_order uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into alerts(type, level, message, product_id, lot_id, order_id)
  values (p_type, p_level, p_msg, p_product, p_lot, p_order)
  on conflict do nothing returning id into v_id;
  if v_id is not null and p_level in ('warning','critical') then
    -- une seule notification par ouverture d'alerte (anti-spam §8.1)
    insert into notifications(event, recipient, channel, subject, body, order_id, status, sent_at)
    values (p_type, case when p_level = 'critical' then 'admin' else 'staff' end,
            'dashboard', 'Alerte BENDO BIO', p_msg, p_order, 'sent', now());
  end if;
end $$;

create or replace function allocate_item_fefo(p_item uuid, p_qty numeric, p_strict boolean default true, p_reason text default 'Commande')
returns numeric language plpgsql security definer set search_path = public as $$
declare it order_items; l lots; v_need numeric := p_qty; v_take numeric;
begin
  select * into it from order_items where id = p_item;
  for l in select * from lots
           where product_id = it.product_id and lot_is_sellable(lots)
           order by expiry_date nulls last, received_at, created_at   -- FEFO puis FIFO
           for update loop
    exit when v_need <= 0;
    v_take := least(v_need, l.qty_remaining);
    update lots set qty_remaining = qty_remaining - v_take,
           status = case when qty_remaining - v_take = 0 then 'depleted'::lot_status else status end
    where id = l.id;
    insert into order_item_lots(order_item_id, lot_id, quantity) values (it.id, l.id, v_take);
    insert into stock_movements(lot_id, product_id, type, quantity, reason, order_id, user_id)
    values (l.id, it.product_id, case when p_reason = 'Commande' then 'sale'::movement_type else 'correction'::movement_type end,
            -v_take, p_reason, it.order_id, auth.uid());
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 and p_strict then
    raise exception 'INSUFFICIENT_STOCK: % (manque %)', it.product_name, trim_scale(v_need);
  end if;
  return p_qty - greatest(v_need, 0);
end $$;

create or replace function release_item_qty(p_item uuid, p_qty numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare it order_items; r record; v_left numeric := p_qty; v_back numeric;
begin
  select * into it from order_items where id = p_item;
  for r in select oil.* from order_item_lots oil join lots l on l.id = oil.lot_id
           where oil.order_item_id = p_item order by l.expiry_date desc nulls first, oil.id desc loop
    exit when v_left <= 0;
    v_back := least(v_left, r.quantity);
    update lots set qty_remaining = qty_remaining + v_back,
           status = case when status = 'depleted' then 'active'::lot_status else status end where id = r.lot_id;
    if v_back = r.quantity then delete from order_item_lots where id = r.id;
    else update order_item_lots set quantity = quantity - v_back where id = r.id; end if;
    insert into stock_movements(lot_id, product_id, type, quantity, reason, order_id, user_id)
    values (r.lot_id, it.product_id, 'correction', v_back, p_reason, it.order_id, auth.uid());
    v_left := v_left - v_back;
  end loop;
end $$;

create or replace function commit_order_stock(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it order_items;
begin
  if (select stock_committed from orders where id = p_order) then return; end if;
  for it in select * from order_items where order_id = p_order and not unavailable order by product_id loop
    perform allocate_item_fefo(it.id, it.quantity, true, 'Commande');
  end loop;
  update orders set stock_committed = true, reserved_until = null where id = p_order;
end $$;

create or replace function receive_stock(
  p_product uuid, p_qty numeric, p_lot_number text default null, p_expiry date default null,
  p_expiry_kind text default 'DLC', p_supplier text default null, p_unit_cost numeric default null,
  p_received date default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_lot uuid; v_num text;
begin
  perform require_staff();
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY: la quantité doit être positive'; end if;
  if not exists (select 1 from products where id = p_product) then raise exception 'NOT_FOUND: produit'; end if;
  v_num := coalesce(nullif(trim(p_lot_number),''),
                    'L' || to_char(now() at time zone shop_tz(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)));
  insert into lots(product_id, lot_number, supplier, received_at, qty_initial, qty_remaining,
                   expiry_date, expiry_kind, unit_cost, notes)
  values (p_product, v_num, p_supplier, coalesce(p_received, (now() at time zone shop_tz())::date), p_qty, p_qty,
          p_expiry, case when p_expiry is null then null else coalesce(p_expiry_kind,'DLC') end, p_unit_cost, p_notes)
  returning id into v_lot;
  insert into stock_movements(lot_id, product_id, type, quantity, reason, user_id)
  values (v_lot, p_product, 'reception', p_qty, coalesce(p_supplier,'Réception'), auth.uid());
  perform refresh_expiry_alerts();
  return v_lot;
end $$;

create or replace function new_order_number() returns text
language plpgsql set search_path = public as $$
declare v text;
begin
  loop
    v := 'BB-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    exit when not exists (select 1 from orders where order_number = v);
  end loop;
  return v;
end $$;

create or replace function place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st settings; v_uid uuid := auth.uid(); v_ff fulfillment_type; v_pm payment_method;
  z delivery_zones; s slots; v_order uuid; v_number text; it record; pr products;
  v_av numeric; v_line numeric; v_sub numeric := 0; v_count int := 0; o orders;
begin
  perform release_expired_reservations();
  select * into st from settings where id = 1;
  if coalesce((p->>'accept_terms')::boolean, false) is not true then
    raise exception 'TERMS_REQUIRED: veuillez accepter les conditions de vente';
  end if;
  v_ff := (p->>'fulfillment')::fulfillment_type;
  v_pm := coalesce(p->>'payment_method','cash_on_delivery')::payment_method;

  if v_uid is null then
    if not st.allow_guest_checkout then raise exception 'AUTH_REQUIRED: connectez-vous pour commander'; end if;
    if coalesce(trim(p->>'guest_name'),'') = '' or coalesce(trim(p->>'guest_phone'),'') = '' then
      raise exception 'CONTACT_REQUIRED: nom et téléphone obligatoires';
    end if;
  elsif not exists (select 1 from profiles where id = v_uid and active) then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  if v_ff = 'pickup' and not st.allow_pickup then raise exception 'PICKUP_DISABLED'; end if;
  if v_ff = 'delivery' then
    if coalesce(trim(p->>'street'),'') = '' or coalesce(trim(p->>'city'),'') = '' then
      raise exception 'ADDRESS_REQUIRED: adresse complète obligatoire pour la livraison';
    end if;
    z := find_zone(p->>'postal_code');
    if z.id is null then raise exception 'OUT_OF_ZONE: adresse hors zone desservie%',
      case when st.allow_pickup then ' — le retrait sur place est possible' else '' end; end if;
  end if;

  -- créneau : verrou pour empêcher le dépassement de capacité (T11)
  select * into s from slots where id = (p->>'slot_id')::uuid for update;
  if not found then raise exception 'SLOT_REQUIRED: choisissez un créneau'; end if;
  if not slot_bookable(s, v_ff, z.id) then
    raise exception 'SLOT_FULL: ce créneau n''est plus disponible, choisissez-en un autre';
  end if;

  if jsonb_array_length(coalesce(p->'items','[]'::jsonb)) = 0 then raise exception 'EMPTY_CART'; end if;

  insert into orders(order_number, customer_id, guest_name, guest_email, guest_phone, status, fulfillment,
                     address_street, address_city, address_postal_code, address_instructions, zone_id, slot_id,
                     payment_method, currency, customer_note, terms_accepted_at, reserved_until)
  values (new_order_number(), v_uid, nullif(trim(p->>'guest_name'),''), nullif(lower(trim(p->>'guest_email')),''),
          nullif(trim(p->>'guest_phone'),''), 'pending_payment', v_ff,
          case when v_ff = 'delivery' then p->>'street' end, case when v_ff = 'delivery' then p->>'city' end,
          case when v_ff = 'delivery' then p->>'postal_code' end, case when v_ff = 'delivery' then p->>'instructions' end,
          z.id, s.id, v_pm, st.currency, nullif(p->>'note',''), now(),
          now() + make_interval(mins => st.reservation_minutes))
  returning id, order_number into v_order, v_number;

  -- lignes : verrouillage des produits dans un ordre stable (pas de survente, T03/T04)
  for it in
    select (x->>'product_id')::uuid as product_id, sum((x->>'quantity')::numeric) as qty
    from jsonb_array_elements(p->'items') x group by 1 order by 1
  loop
    select * into pr from products where id = it.product_id for update;
    if not found or pr.status <> 'active' then raise exception 'PRODUCT_UNAVAILABLE: produit indisponible'; end if;
    if it.qty is null or it.qty <= 0 or it.qty < pr.min_qty then
      raise exception 'INVALID_QTY: quantité minimale % pour %', trim_scale(pr.min_qty), pr.name;
    end if;
    if pr.unit not in ('kg','g','l') and it.qty <> trunc(it.qty) then
      raise exception 'INVALID_QTY: % se vend à l''unité (quantité entière)', pr.name;
    end if;
    if abs(mod(it.qty - pr.min_qty, pr.qty_step)) > 0.0001 then
      raise exception 'INVALID_QTY: % se commande par multiples de % %', pr.name, trim_scale(pr.qty_step), pr.unit;
    end if;
    v_av := coalesce(product_available(pr.id), 0);
    if it.qty > v_av then
      raise exception 'INSUFFICIENT_STOCK: % — disponible : % %', pr.name, trim_scale(v_av), pr.unit;
    end if;
    v_line := round(pr.price * it.qty, 2);
    insert into order_items(order_id, product_id, product_name, product_sku, unit, unit_price, tax_rate, quantity, line_total)
    values (v_order, pr.id, pr.name || coalesce(' — ' || pr.packaging, ''), pr.sku, pr.unit, pr.price, pr.tax_rate, it.qty, v_line);
    v_sub := v_sub + v_line; v_count := v_count + 1;
  end loop;

  if v_ff = 'delivery' and v_sub < z.min_order then
    raise exception 'MIN_ORDER: minimum de commande % % pour la zone %', z.min_order, st.currency, z.name;
  end if;

  perform recompute_order_totals(v_order);

  if v_pm = 'online' then
    -- paiement en ligne : stock réservé jusqu'à confirmation du prestataire
    insert into order_status_history(order_id, from_status, to_status, note, user_id)
    values (v_order, null, 'pending_payment', 'Commande créée — en attente de paiement', v_uid);
  else
    -- paiement à la livraison/au retrait accepté : confirmation immédiate + déstockage FEFO
    perform commit_order_stock(v_order);
    update orders set status = 'confirmed' where id = v_order;
    insert into order_status_history(order_id, from_status, to_status, note, user_id)
    values (v_order, null, 'confirmed', 'Commande confirmée — paiement à la remise', v_uid);
    perform enqueue_order_notification(v_order, 'order_confirmed', 'Votre commande ' || v_number || ' est confirmée',
      'Merci pour votre commande BENDO BIO. Nous la préparons pour le créneau choisi.');
    insert into notifications(event, recipient, channel, order_id, subject, body, status, sent_at)
    values ('new_order','staff','dashboard', v_order, 'Nouvelle commande ' || v_number, 'Nouvelle commande confirmée', 'sent', now());
  end if;

  if v_uid is not null and v_ff = 'delivery' and coalesce((p->>'save_address')::boolean,false)
     and not exists (select 1 from addresses where user_id = v_uid and street = p->>'street' and postal_code = p->>'postal_code') then
    insert into addresses(user_id, street, city, postal_code, instructions)
    values (v_uid, p->>'street', p->>'city', p->>'postal_code', p->>'instructions');
  end if;
  if v_uid is not null and nullif(trim(p->>'guest_phone'),'') is not null then
    update profiles set phone = coalesce(phone, trim(p->>'guest_phone')) where id = v_uid;
  end if;

  select * into o from orders where id = v_order;
  return jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status,
                            'total', o.total, 'currency', o.currency, 'reserved_until', o.reserved_until);
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
  end if;
  return jsonb_build_object('status', (select status from orders where id = p_order), 'payment_status', 'paid', 'duplicate', false);
end $$;

create or replace function update_order_item(p_item uuid, p_picked boolean default null,
  p_actual_weight numeric default null, p_unavailable boolean default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare it order_items; o orders; v_diff numeric; v_got numeric;
begin
  perform require_staff();
  select * into it from order_items where id = p_item for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into o from orders where id = it.order_id for update;
  if o.status not in ('confirmed','preparing','pending_payment') then
    raise exception 'INVALID_STATE: modification possible uniquement avant la fin de la préparation';
  end if;
  if p_picked is not null then update order_items set picked = p_picked where id = p_item; end if;

  if p_actual_weight is not null and not it.unavailable then
    if p_actual_weight <= 0 then raise exception 'INVALID_QTY'; end if;
    update order_items set actual_weight = p_actual_weight, line_total = round(unit_price * p_actual_weight, 2) where id = p_item;
    -- le stock suit le poids réel (écart par rapport à ce qui a déjà été sorti)
    if o.stock_committed then
      v_diff := p_actual_weight - coalesce(it.actual_weight, it.quantity);
      if v_diff > 0 then
        perform allocate_item_fefo(p_item, v_diff, false, 'Poids réel pesé (+' || trim_scale(v_diff) || ')');
      elsif v_diff < 0 then
        perform release_item_qty(p_item, -v_diff, 'Poids réel pesé (' || trim_scale(v_diff) || ')');
      end if;
    end if;
  end if;

  if p_unavailable is not null and p_unavailable <> it.unavailable then
    if coalesce(length(trim(p_note)),0) < 3 then raise exception 'REASON_REQUIRED: motif obligatoire'; end if;
    if o.stock_committed then
      if p_unavailable then
        -- la ligne ne sort pas : tout ce qui lui était alloué revient dans les lots
        perform release_item_qty(p_item, coalesce((select sum(quantity) from order_item_lots where order_item_id = p_item), 0),
                                 'Ligne retirée : ' || p_note);
      else
        -- ligne rétablie : nouvelle sortie FEFO (erreur si le stock ne suffit plus)
        perform allocate_item_fefo(p_item, coalesce(it.actual_weight, it.quantity), true, 'Ligne rétablie : ' || p_note);
      end if;
    end if;
    update order_items set unavailable = p_unavailable where id = p_item;
    insert into order_status_history(order_id, from_status, to_status, note, user_id)
    values (o.id, o.status, o.status, format('Ligne « %s » %s : %s', it.product_name,
            case when p_unavailable then 'retirée' else 'rétablie' end, p_note), auth.uid());
    perform enqueue_order_notification(o.id, 'order_modified', 'Commande ' || o.order_number || ' modifiée',
      format('Article « %s » %s. %s', it.product_name, case when p_unavailable then 'indisponible' else 'rétabli' end, p_note));
  end if;
  perform recompute_order_totals(o.id);
end $$;

create or replace function track_order(p_number text, p_contact text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'fulfillment', o.fulfillment,
    'total', o.total, 'currency', o.currency, 'created_at', o.created_at,
    'slot_start', s.starts_at, 'slot_end', s.ends_at, 'payment_status', o.payment_status,
    'items', (select jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity, 'unit', unit, 'line_total', line_total, 'unavailable', unavailable))
              from order_items where order_id = o.id))
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

-- ---------------------------------------------------------------------
-- Tableau de bord, rapports, tâches planifiées, diagnostic
-- ---------------------------------------------------------------------
create or replace function dashboard_stats(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text := shop_tz(); v jsonb;
begin
  perform require_staff();
  with o as (
    select * from orders
    where (created_at at time zone v_tz)::date between p_from and p_to
  ), valid as (select * from o where status not in ('cancelled','pending_payment','refunded'))
  select jsonb_build_object(
    'revenue', coalesce((select sum(total) from valid),0),
    'orders', (select count(*) from valid),
    'avg_basket', coalesce((select round(avg(total),2) from valid),0),
    'cancelled', (select count(*) from o where status = 'cancelled'),
    'delivered', (select count(*) from o where status = 'delivered'),
    'failed_deliveries', (select count(*) from o where status = 'delivery_failed'),
    'top_products', coalesce((select jsonb_agg(t) from (
        select oi.product_name as name, sum(coalesce(oi.actual_weight, oi.quantity)) as qty, sum(oi.line_total) as revenue
        from order_items oi join valid on valid.id = oi.order_id where not oi.unavailable
        group by oi.product_name order by sum(oi.line_total) desc limit 8) t), '[]'::jsonb),
    'losses', coalesce((select jsonb_agg(t) from (
        select m.type, sum(-m.quantity) as qty, round(sum(-m.quantity * coalesce(l.unit_cost,0)),2) as value
        from stock_movements m left join lots l on l.id = m.lot_id
        where m.type in ('loss','breakage','destruction','donation')
          and (m.created_at at time zone v_tz)::date between p_from and p_to
        group by m.type) t), '[]'::jsonb),
    'stockouts', (select count(*) from products p join product_stock() s on s.product_id = p.id
                  where p.status = 'active' and s.available <= 0),
    'daily', coalesce((select jsonb_agg(t order by t.day) from (
        select (created_at at time zone v_tz)::date as day, count(*) as orders, sum(total) as revenue
        from valid group by 1) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create or replace function system_health() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_cron boolean; v_rt jsonb;
begin
  perform require_staff();
  v_cron := exists (select 1 from pg_extension where extname = 'pg_cron');
  select coalesce(jsonb_agg(tablename), '[]'::jsonb) into v_rt from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public';
  v := jsonb_build_object(
    'server_time', now(),
    'postgres_version', current_setting('server_version'),
    'timezone_setting', shop_tz(),
    'schema_version', '1.0.0',
    'pg_cron_installed', v_cron,
    'realtime_tables', v_rt,
    'counts', jsonb_build_object(
      'products', (select count(*) from products),
      'lots', (select count(*) from lots),
      'movements', (select count(*) from stock_movements),
      'orders', (select count(*) from orders),
      'customers', (select count(*) from profiles where role = 'client'),
      'staff', (select count(*) from profiles where role in ('employee','admin')),
      'open_alerts', (select count(*) from alerts where status = 'open'),
      'future_slots', (select count(*) from slots where starts_at > now())),
    'notifications', jsonb_build_object(
      'pending', (select count(*) from notifications where status = 'pending' and channel <> 'dashboard'),
      'failed', (select count(*) from notifications where status = 'failed'),
      'sent', (select count(*) from notifications where status = 'sent')),
    'last_job', (select jsonb_build_object('ran_at', ran_at, 'details', details) from job_runs order by ran_at desc limit 1),
    'rls_disabled_tables', (select coalesce(jsonb_agg(relname), '[]'::jsonb) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)
  );
  return v;
end $$;

create or replace function process_erasure(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r data_requests;
begin
  perform require_admin();
  select * into r from data_requests where id = p_request for update;
  if r.kind <> 'erasure' then raise exception 'INVALID_KIND'; end if;
  if r.user_id is not null then
    perform set_config('bendo.internal','1', true);
    delete from addresses where user_id = r.user_id;
    update profiles set full_name = 'Client supprimé', phone = null, email = null, internal_notes = null,
           marketing_consent = false, sms_consent = false, active = false where id = r.user_id;
  end if;
  update orders set guest_name = 'Client supprimé', guest_phone = null, guest_email = null, address_instructions = null
  where lower(guest_email) = lower(coalesce((select email from auth.users where id = r.user_id), r.email))
    and status in ('delivered','cancelled','refunded');
  update data_requests set status = 'done', handled_by = auth.uid(), handled_at = now() where id = p_request;
end $$;

-- ---------------------------------------------------------------------
-- Paramètres de l'activité — Pointe-Noire, République du Congo
-- ---------------------------------------------------------------------
update settings set
  shop_name = 'BENDO BIO',
  currency = 'XAF',
  timezone = 'Africa/Brazzaville',
  contact_phone = '+242 06 606 70 58',
  contact_email = 'bendobio@gmail.com',
  pickup_address = 'Ngoyo centrale, Pointe-Noire',
  delivery_info = 'Livraison à la demande et aux frais du client à Pointe-Noire. Chaque commande est vérifiée par nos agents avant la remise. Retrait possible à Ngoyo centrale.',
  legal_notice = E'BENDO BIO — vente en ligne de produits frais et bio.\nSiège : Ngoyo centrale, Pointe-Noire, République du Congo.\nTéléphone : +242 06 606 70 58 — E-mail : bendobio@gmail.com\nCréateur de l''application : Henschel.\nMentions légales complètes (RCCM, NIU) à compléter.',
  terms = case when terms like 'Conditions générales de vente à compléter%' or terms is null then
    E'Conditions générales de vente BENDO BIO\n\n1. Commandes : passées sur le site, confirmées après vérification du stock et du créneau.\n2. Prix : en francs CFA (XAF), toutes taxes comprises. Les produits au poids sont facturés au poids réel pesé à la préparation.\n3. Livraison : à la demande et aux frais du client, dans les quartiers desservis de Pointe-Noire, sur le créneau choisi. Retrait gratuit à Ngoyo centrale.\n4. Vérification : chaque commande est contrôlée par nos agents avant la remise ; le client peut vérifier ses produits à la réception.\n5. Paiement : à la remise (espèces ou mobile money).\n6. Annulation : possible avant la préparation en contactant le +242 06 606 70 58.\n(Texte à faire valider.)'
    else terms end
where id = 1;

-- Prix des produits d'exemple : conversion € → FCFA (seulement s'ils n'ont pas été modifiés)
update products set price = round(price * 655.957 / 50) * 50, tax_rate = 0
where sku in ('LEG-TOM-001','LEG-OIG-001','LEG-CAR-001','LEG-AUB-001','LEG-BRO-001','LEG-AIL-001','FRU-POM-001','HER-PER-001','LAI-OEU-001')
  and price < 50;

-- Zone de livraison : quartiers (arrondissements) de Pointe-Noire
update delivery_zones set active = false where name = 'Zone centre (exemple)';
insert into delivery_zones (name, postal_codes, fee, min_order, free_above, active)
select 'Pointe-Noire', array['Lumumba','Mvoumvou','Tié-Tié','Loandjili','Mongo-Mpoukou','Ngoyo'], 1000, 3000, null, true
where not exists (select 1 from delivery_zones where name = 'Pointe-Noire');

-- Créneaux futurs sans commande : recréés à l'heure de Brazzaville
-- (seulement les créneaux ouverts sans note : les créneaux bloqués à la main sont conservés)
delete from slots s where s.starts_at > now() and s.status = 'open' and s.note is null
  and not exists (select 1 from orders o where o.slot_id = s.id);
select generate_slots(14);

-- Notifications tableau de bord déjà créées : rien à envoyer
update notifications set status = 'sent', sent_at = coalesce(sent_at, created_at) where channel = 'dashboard' and status = 'pending';

-- Demandes RGPD : l'e-mail doit être celui du compte connecté
drop policy if exists dr_insert on data_requests;
create policy dr_insert on data_requests for insert with check (
  auth.uid() is not null and user_id = auth.uid() and lower(email) = lower(coalesce(auth.jwt()->>'email','')));

-- Fonctions internes non exposées à l'API
revoke execute on function allocate_item_fefo(uuid, numeric, boolean, text) from public, anon, authenticated;
revoke execute on function release_item_qty(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function commit_order_stock(uuid) from public, anon, authenticated;
revoke execute on function open_alert(text, alert_level, text, uuid, uuid, uuid) from public, anon, authenticated;

-- Droits (au cas où) + rechargement de l'API
grant execute on function receive_stock(uuid, numeric, text, date, text, text, numeric, date, text) to authenticated;
grant execute on function confirm_payment(uuid, text, text, numeric) to authenticated, service_role;
revoke execute on function new_order_number() from public, anon;
notify pgrst, 'reload schema';
