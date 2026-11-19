-- =====================================================================
-- BENDO BIO — Mise à jour 010 : CODE DE LIVRAISON + MESSAGERIE
--  1. Au départ en livraison, un code (6 caractères, chiffres + lettres) est généré par le
--     générateur aléatoire cryptographique du serveur et envoyé UNIQUEMENT au client.
--     Le livreur ne le voit jamais : il doit le saisir pour confirmer la remise (5 essais max).
--  2. Messagerie client ⇄ BENDO BIO, annonces / promotions envoyées en notification.
-- À exécuter UNE fois après 009, dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Code de livraison
-- ---------------------------------------------------------------------
create table if not exists delivery_codes (
  order_id uuid primary key references orders(id) on delete cascade,
  code text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  locked_at timestamptz
);
alter table delivery_codes enable row level security;
-- Seul le client de la commande (et l'administrateur, pour l'assistance) peut lire le code. Jamais le livreur.
drop policy if exists dc_customer on delivery_codes;
create policy dc_customer on delivery_codes for select using (
  exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()) or is_admin());
revoke all on delivery_codes from anon;
grant select on delivery_codes to authenticated;

-- Code aléatoire : octets issus du générateur cryptographique du serveur (gen_random_uuid, CSPRNG),
-- alphabet sans caractères ambigus (pas de 0/O, 1/I/L). Tirage par rejet pour une distribution uniforme.
create or replace function gen_delivery_code(p_len int default 6) returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   -- 31 symboles
  v text := ''; b bytea; i int; x int;
begin
  while length(v) < p_len loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    foreach i in array array[0,1,2,3,4,5,7,9,10,11,12,13,14,15] loop   -- octets entièrement aléatoires d'un UUID v4
      x := get_byte(b, i);
      if x < 248 then v := v || substr(alphabet, (x % 31) + 1, 1); end if;   -- 248 = 8×31 : pas de biais
      exit when length(v) >= p_len;
    end loop;
  end loop;
  return v;
end $$;

create or replace function ensure_delivery_code(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select code into v from delivery_codes where order_id = p_order and used_at is null and locked_at is null;
  if v is null then
    v := gen_delivery_code(6);
    insert into delivery_codes(order_id, code) values (p_order, v)
    on conflict (order_id) do update set code = excluded.code, attempts = 0, created_at = now(), used_at = null, locked_at = null;
  end if;
  return v;
end $$;

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

  -- Livraison à domicile : la remise se confirme avec le code du client
  if p_status = 'delivered' and o.fulfillment = 'delivery'
     and exists (select 1 from delivery_codes c where c.order_id = p_order and c.used_at is null)
     and current_setting('bendo.code_ok', true) is distinct from '1' then
    if not is_staff() then
      raise exception 'CODE_REQUIRED: demandez au client son code de livraison pour confirmer la remise';
    end if;
    if coalesce(length(trim(p_note)),0) < 3 then
      raise exception 'REASON_REQUIRED: livraison confirmée sans le code du client — motif obligatoire';
    end if;
    p_note := 'Confirmée SANS code client : ' || trim(p_note);
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
      when p_status = 'out_for_delivery' then 'Votre commande est partie en livraison.'
        || ' 🔐 Votre CODE DE LIVRAISON : ' || ensure_delivery_code(p_order)
        || '. Donnez-le au livreur uniquement en main propre, au moment où il vous remet le colis. Ne le communiquez JAMAIS par téléphone, ni par SMS, ni à quelqu''un qui vous appelle.'
        || coalesce(' ' || nullif(trim(p_note),''), '')
      when p_status = 'ready' and o.fulfillment = 'pickup' then 'Votre commande vous attend à notre point de retrait.' || coalesce(' ' || nullif(trim(p_note),''), '')
      else coalesce(p_note, '') end;
    perform enqueue_order_notification(p_order, 'status_' || p_status,
      'Commande ' || o.order_number || ' : ' || v_label, v_body);
  end if;
end $$;

-- Validation de la remise par le livreur avec le code donné par le client
create or replace function courier_confirm_delivery(p_order uuid, p_code text, p_received_by text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o orders; c delivery_codes;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND: commande'; end if;
  if not (is_staff() or (is_courier() and o.courier_id = auth.uid())) then
    raise exception 'FORBIDDEN: action non autorisée' using errcode = '42501';
  end if;
  if o.status <> 'out_for_delivery' then raise exception 'INVALID_STATE: la commande doit être « en livraison »'; end if;
  select * into c from delivery_codes where order_id = p_order for update;
  if not found then raise exception 'NO_CODE: aucun code pour cette commande — contactez BENDO BIO'; end if;
  if c.locked_at is not null then
    return jsonb_build_object('ok', false, 'locked', true, 'remaining', 0);
  end if;
  if upper(regexp_replace(coalesce(p_code,''), '[^0-9A-Za-z]', '', 'g')) <> c.code then
    update delivery_codes set attempts = attempts + 1,
           locked_at = case when attempts + 1 >= 5 then now() end
    where order_id = p_order;
    if c.attempts + 1 >= 5 then
      perform open_alert('notification_failed', 'critical',
        'Code de livraison bloqué (5 erreurs) — commande ' || o.order_number || '. Vérifiez avec le client avant de confirmer.', null, null, p_order);
    end if;
    -- pas d'exception : le compteur d'essais doit être conservé
    return jsonb_build_object('ok', false, 'locked', c.attempts + 1 >= 5, 'remaining', greatest(0, 5 - (c.attempts + 1)));
  end if;
  update delivery_codes set used_at = now() where order_id = p_order;
  perform set_config('bendo.code_ok', '1', true);
  perform set_order_status(p_order, 'delivered', 'Remise confirmée avec le code du client', null, p_received_by);
  perform set_config('bendo.code_ok', '', true);
  return jsonb_build_object('ok', true);
end $$;

-- Le client (ou l'invité via le suivi) retrouve son code
create or replace function my_delivery_code(p_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', c.code, 'used_at', c.used_at, 'locked', c.locked_at is not null)
  from delivery_codes c join orders o on o.id = c.order_id
  where c.order_id = p_order and o.customer_id = auth.uid()
$$;

-- Suivi invité : le code est ajouté uniquement si n° de commande + contact sont corrects
create or replace function track_delivery_code(p_number text, p_contact text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  if track_order(p_number, p_contact) is null then return null; end if;
  select id into v_id from orders where upper(order_number) = upper(trim(p_number)) and status = 'out_for_delivery';
  return (select code from delivery_codes where order_id = v_id and used_at is null and locked_at is null);
end $$;

-- ---------------------------------------------------------------------
-- 2. Messagerie client ⇄ BENDO BIO
-- ---------------------------------------------------------------------
create table if not exists messages (
  id bigint generated always as identity primary key,
  customer_id uuid not null references profiles(id) on delete cascade,   -- fil de discussion du client
  from_staff boolean not null,
  sender_id uuid references profiles(id) on delete set null,
  kind text not null default 'other' check (kind in ('availability','special_request','order','other','reply')),
  product_id uuid references products(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_by_customer_at timestamptz,
  read_by_staff_at timestamptz
);
create index if not exists messages_customer_idx on messages(customer_id, created_at);
alter table messages enable row level security;
drop policy if exists msg_read on messages;
create policy msg_read on messages for select using (customer_id = auth.uid() or is_staff());
grant select on messages to authenticated;

create table if not exists announcements (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) between 2 and 120),
  body text not null check (length(trim(body)) between 2 and 1000),
  product_id uuid references products(id) on delete set null,
  audience text not null default 'marketing' check (audience in ('marketing','all')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  recipients int not null default 0
);
alter table announcements enable row level security;
drop policy if exists ann_read on announcements;
create policy ann_read on announcements for select using (expires_at is null or expires_at > now() or is_staff());
grant select on announcements to anon, authenticated;

-- Le client écrit à BENDO BIO
create or replace function send_customer_message(p_body text, p_kind text default 'other', p_product uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_name text; v_prod text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: connectez-vous pour écrire à BENDO BIO'; end if;
  if coalesce(length(trim(p_body)),0) < 2 then raise exception 'EMPTY: message vide'; end if;
  if (select count(*) from messages where customer_id = auth.uid() and not from_staff and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'RATE_LIMIT: trop de messages, réessayez plus tard';
  end if;
  insert into messages(customer_id, from_staff, sender_id, kind, product_id, body)
  values (auth.uid(), false, auth.uid(), coalesce(nullif(p_kind,''),'other'), p_product, left(trim(p_body), 2000))
  returning id into v_id;
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  select name into v_prod from products where id = p_product;
  insert into notifications(event, recipient, channel, subject, body, status, sent_at)
  values ('customer_message', 'staff', 'dashboard',
          '💬 Message de ' || coalesce(v_name, 'un client'),
          case p_kind when 'availability' then 'Disponibilité' || coalesce(' de « ' || v_prod || ' »', '') || ' : '
                      when 'special_request' then 'Demande spéciale : ' else '' end || left(trim(p_body), 200), 'sent', now());
  return v_id;
end $$;

-- L'équipe répond à un client
create or replace function staff_send_message(p_customer uuid, p_body text, p_product uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform require_staff();
  if coalesce(length(trim(p_body)),0) < 2 then raise exception 'EMPTY: message vide'; end if;
  insert into messages(customer_id, from_staff, sender_id, kind, product_id, body)
  values (p_customer, true, auth.uid(), 'reply', p_product, left(trim(p_body), 2000)) returning id into v_id;
  update messages set read_by_staff_at = now() where customer_id = p_customer and not from_staff and read_by_staff_at is null;
  insert into notifications(event, recipient, channel, subject, body, status, sent_at, user_id)
  values ('staff_message', null, 'app', '💬 Message de BENDO BIO', left(trim(p_body), 300), 'sent', now(), p_customer);
  return v_id;
end $$;

create or replace function mark_messages_read(p_customer uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_customer is not null then
    perform require_staff();
    update messages set read_by_staff_at = now() where customer_id = p_customer and not from_staff and read_by_staff_at is null;
  else
    update messages set read_by_customer_at = now() where customer_id = auth.uid() and from_staff and read_by_customer_at is null;
  end if;
end $$;

-- Annonce / promotion : notification à tous les clients concernés
-- audience 'marketing' = clients ayant accepté les offres ; 'all' = information de service à tous les clients
create or replace function publish_announcement(p_title text, p_body text, p_product uuid default null,
  p_audience text default 'marketing', p_days int default 7) returns int
language plpgsql security definer set search_path = public as $$
declare v_id bigint; n int;
begin
  perform require_staff();
  insert into announcements(title, body, product_id, audience, created_by, expires_at)
  values (trim(p_title), trim(p_body), p_product, p_audience, auth.uid(),
          case when p_days > 0 then now() + make_interval(days => p_days) end)
  returning id into v_id;
  insert into notifications(event, recipient, channel, subject, body, status, sent_at, user_id)
  select 'announcement', null, 'app', '📣 ' || trim(p_title), trim(p_body), 'sent', now(), p.id
  from profiles p
  where p.role = 'client' and p.active and (p_audience = 'all' or p.marketing_consent);
  get diagnostics n = row_count;
  update announcements set recipients = n where id = v_id;
  return n;
end $$;

-- Compteurs du menu : + messages non lus
create or replace function staff_badges() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_default timestamptz := now() - interval '7 days';
  s_orders timestamptz; s_customers timestamptz; s_products timestamptz; s_stock timestamptz; s_users timestamptz;
begin
  perform require_staff();
  select coalesce(max(seen_at) filter (where section = 'orders'), v_default),
         coalesce(max(seen_at) filter (where section = 'customers'), v_default),
         coalesce(max(seen_at) filter (where section = 'products'), v_default),
         coalesce(max(seen_at) filter (where section = 'stock'), v_default),
         coalesce(max(seen_at) filter (where section = 'users'), v_default)
    into s_orders, s_customers, s_products, s_stock, s_users
  from staff_seen where user_id = v_me;
  return jsonb_build_object(
    -- nouveautés depuis la dernière visite
    'new_orders', (select count(*) from orders where created_at > s_orders and status <> 'pending_payment'),
    'new_customers', (select count(*) from profiles where created_at > s_customers and role = 'client' and requested_role is null),
    'new_products', (select count(*) from products where created_at > s_products),
    'new_lots', (select count(*) from lots where created_at > s_stock),
    'new_users', (select count(*) from profiles where created_at > s_users),
    -- à traiter (indépendant des visites)
    'to_prepare', (select count(*) from orders where status in ('confirmed','preparing')),
    'to_deliver', (select count(*) from orders where status in ('ready','out_for_delivery')),
    'pending_payment', (select count(*) from orders where status = 'pending_payment'),
    'role_requests', (select count(*) from profiles where requested_role is not null),
    'data_requests', (select count(*) from data_requests where status in ('open','in_progress')),
    'open_alerts', (select count(*) from alerts where status = 'open'),
    'critical_alerts', (select count(*) from alerts where status = 'open' and level = 'critical'),
    'unread_messages', (select count(*) from messages where not from_staff and read_by_staff_at is null),
    'unassigned_deliveries', (select count(*) from orders where fulfillment = 'delivery' and courier_id is null
                               and status in ('confirmed','preparing','ready')),
    'since', jsonb_build_object('orders', s_orders, 'customers', s_customers, 'products', s_products, 'stock', s_stock));
end $$;

do $$ declare t text; begin
  foreach t in array array['messages','announcements'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Droits
revoke execute on function gen_delivery_code(int) from public, anon, authenticated;
revoke execute on function ensure_delivery_code(uuid) from public, anon, authenticated;
revoke execute on function courier_confirm_delivery(uuid, text, text) from public, anon;
revoke execute on function my_delivery_code(uuid) from public, anon;
revoke execute on function send_customer_message(text, text, uuid) from public, anon;
revoke execute on function staff_send_message(uuid, text, uuid) from public, anon;
revoke execute on function mark_messages_read(uuid) from public, anon;
revoke execute on function publish_announcement(text, text, uuid, text, int) from public, anon;
grant execute on function courier_confirm_delivery(uuid, text, text) to authenticated;
grant execute on function my_delivery_code(uuid) to authenticated;
grant execute on function track_delivery_code(text, text) to anon, authenticated;
grant execute on function send_customer_message(text, text, uuid) to authenticated;
grant execute on function staff_send_message(uuid, text, uuid) to authenticated;
grant execute on function mark_messages_read(uuid) to authenticated;
grant execute on function publish_announcement(text, text, uuid, text, int) to authenticated;
grant execute on function staff_badges() to authenticated;
notify pgrst, 'reload schema';
