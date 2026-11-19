-- =====================================================================
-- BENDO BIO — Fonctions métier (côté serveur)
-- Stock FEFO, réservations, commandes, créneaux, alertes, audit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rôles
-- ---------------------------------------------------------------------
create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('employee','admin') from profiles where id = auth.uid() and active), false)
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid() and active), false)
$$;

-- Vrai quand l'appel ne vient PAS de l'API (SQL Editor, pg_cron, tâches internes) :
-- ces contextes sont réservés au propriétaire du projet.
create or replace function is_backend() returns boolean
language sql stable as $$
  select auth.uid() is null and session_user <> 'authenticator'
     and coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role',
                  current_setting('request.jwt.claim.role', true), '') not in ('anon','authenticated')
$$;

create or replace function require_staff() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'FORBIDDEN: accès réservé au personnel' using errcode = '42501'; end if;
end $$;

create or replace function require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN: accès réservé à l''administrateur' using errcode = '42501'; end if;
end $$;

create or replace function shop_tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from settings where id = 1), 'UTC')
$$;

-- ---------------------------------------------------------------------
-- Profils : création automatique à l'inscription
-- ---------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, phone, marketing_consent)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'phone',
          coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Un client ne peut pas changer son propre rôle / statut
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
drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard before update on profiles for each row execute function guard_profile_update();

-- Premier administrateur : le premier compte qui appelle cette fonction
-- alors qu'aucun admin n'existe devient administrateur.
create or replace function claim_first_admin() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from profiles where role = 'admin') then return false; end if;
  perform set_config('bendo.internal','1', true);
  update profiles set role = 'admin', active = true where id = auth.uid();
  insert into audit_log(user_id, action, entity, entity_id, new_value)
  values (auth.uid(), 'claim_first_admin', 'profiles', auth.uid()::text, jsonb_build_object('role','admin'));
  return true;
end $$;

create or replace function admin_exists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where role = 'admin')
$$;

create or replace function admin_set_user(p_user uuid, p_role user_role, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if (p_role <> 'admin' or not p_active)
     and (select role from profiles where id = p_user) = 'admin'
     and (select count(*) from profiles where role = 'admin' and active) <= 1 then
    raise exception 'LAST_ADMIN: impossible de retirer le dernier administrateur';
  end if;
  update profiles set role = p_role, active = p_active where id = p_user;
end $$;

create or replace function touch_last_login() returns void
language sql security definer set search_path = public as $$
  update profiles set last_login_at = now() where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Audit générique (§3.1 : toute action critique est historisée)
-- ---------------------------------------------------------------------
create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_id text;
begin
  if tg_op = 'DELETE' then v_old := to_jsonb(old); v_id := v_old->>'id';
  elsif tg_op = 'INSERT' then v_new := to_jsonb(new); v_id := v_new->>'id';
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := v_new->>'id';
    -- ne garder que les champs modifiés
    select jsonb_object_agg(key, value) into v_new from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old)->n.key);
    select jsonb_object_agg(key, value) into v_old from jsonb_each(to_jsonb(old)) o
      where v_new ? o.key;
    if v_new is null or v_new - 'updated_at' = '{}'::jsonb then return new; end if;
  end if;
  insert into audit_log(user_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_old, v_new);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['products','categories','lots','orders','profiles','settings',
                           'delivery_zones','slot_templates','slots','closed_days','payments'] loop
    execute format('drop trigger if exists audit_%1$s on %1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I
                    for each row execute function audit_trigger()', t);
  end loop;
end $$;

-- Journaux immuables (STK-08)
create or replace function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'IMMUTABLE: % ne peut pas être modifié ou supprimé', tg_table_name; end $$;
drop trigger if exists movements_immutable on stock_movements;
create trigger movements_immutable before update or delete on stock_movements
  for each row execute function forbid_change();
drop trigger if exists audit_immutable on audit_log;
create trigger audit_immutable before update or delete on audit_log
  for each row execute function forbid_change();

-- Une commande livrée ne peut pas être supprimée (§7.1)
create or replace function forbid_order_delete() returns trigger language plpgsql as $$
begin
  if old.status not in ('pending_payment','cancelled') then
    raise exception 'FORBIDDEN: une commande % ne peut pas être supprimée (archivage uniquement)', old.status;
  end if;
  return old;
end $$;
drop trigger if exists orders_no_delete on orders;
create trigger orders_no_delete before delete on orders for each row execute function forbid_order_delete();

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists products_touch on products;
create trigger products_touch before update on products for each row execute function touch_updated_at();
drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders for each row execute function touch_updated_at();
drop trigger if exists settings_touch on settings;
create trigger settings_touch before update on settings for each row execute function touch_updated_at();

-- Prix et seuils : modification réservée à l'admin (matrice §3.2)
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
drop trigger if exists products_guard on products;
create trigger products_guard before update on products for each row execute function guard_product_update();

-- ---------------------------------------------------------------------
-- Stock : calcul physique / réservé / disponible (STK-01)
-- ---------------------------------------------------------------------
create or replace function lot_is_sellable(l lots) returns boolean
language sql stable as $$
  select l.status = 'active' and l.qty_remaining > 0
     and (l.expiry_date is null or l.expiry_date >= (now() at time zone shop_tz())::date)
$$;

create or replace function product_stock()
returns table(product_id uuid, physical numeric, sellable numeric, reserved numeric, available numeric)
language sql stable security definer set search_path = public as $$
  with phys as (
    select p.id,
           coalesce(sum(l.qty_remaining) filter (where l.status <> 'depleted'), 0) as physical,
           coalesce(sum(l.qty_remaining) filter (where lot_is_sellable(l)), 0) as sellable
    from products p left join lots l on l.product_id = p.id
    group by p.id
  ), res as (
    select oi.product_id, sum(oi.quantity) as reserved
    from order_items oi join orders o on o.id = oi.order_id
    where o.status = 'pending_payment' and not o.stock_committed and o.reserved_until > now()
    group by oi.product_id
  )
  select phys.id, phys.physical, phys.sellable, coalesce(res.reserved,0),
         greatest(phys.sellable - coalesce(res.reserved,0), 0)
  from phys left join res on res.product_id = phys.id
$$;

create or replace function product_available(p_product uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select available from product_stock() where product_id = p_product
$$;

-- ---------------------------------------------------------------------
-- Alertes
-- ---------------------------------------------------------------------
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

create or replace function close_alert(p_type text, p_product uuid default null, p_lot uuid default null, p_note text default 'Résolue automatiquement')
returns void language sql security definer set search_path = public as $$
  update alerts set status = 'resolved', resolved_at = now(), resolution_note = p_note
  where status = 'open' and type = p_type
    and product_id is not distinct from p_product
    and (p_lot is null or lot_id = p_lot);
$$;

create or replace function refresh_product_alerts(p_product uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p products; v_av numeric;
begin
  select * into p from products where id = p_product;
  if not found then return; end if;
  if p.status <> 'active' then
    perform close_alert('low_stock', p.id, null, 'Produit inactif');
    perform close_alert('critical_stock', p.id, null, 'Produit inactif');
    return;
  end if;
  v_av := coalesce(product_available(p.id), 0);
  if v_av <= p.critical_threshold then
    perform close_alert('low_stock', p.id);
    perform open_alert('critical_stock','critical',
      format('Stock critique : %s — %s %s disponible(s) (seuil %s)', p.name, trim_scale(v_av), p.unit, trim_scale(p.critical_threshold)), p.id);
  elsif v_av <= p.low_threshold then
    perform close_alert('critical_stock', p.id);
    perform open_alert('low_stock','warning',
      format('Stock bas : %s — %s %s disponible(s) (seuil %s)', p.name, trim_scale(v_av), p.unit, trim_scale(p.low_threshold)), p.id);
  else
    perform close_alert('low_stock', p.id);
    perform close_alert('critical_stock', p.id);
  end if;
end $$;

create or replace function movement_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform refresh_product_alerts(new.product_id); return new; end $$;
drop trigger if exists movements_alerts on stock_movements;
create trigger movements_alerts after insert on stock_movements for each row execute function movement_after_insert();

create or replace function refresh_expiry_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_today date := (now() at time zone shop_tz())::date; v_days int; n int := 0;
begin
  for r in
    select l.*, p.name as pname, p.unit as punit,
           coalesce(p.expiry_alert_days, c.expiry_alert_days, s.default_expiry_alert_days) as alert_days
    from lots l join products p on p.id = l.product_id
    left join categories c on c.id = p.category_id
    cross join settings s
    where l.expiry_date is not null and l.qty_remaining > 0 and l.status in ('active','blocked')
  loop
    v_days := r.expiry_date - v_today;
    if v_days < 0 then
      if r.status = 'active' then
        update lots set status = 'expired' where id = r.id;
      end if;
      perform close_alert('expiry_soon', r.product_id, r.id, 'Lot échu');
      perform open_alert('expired_lot','critical',
        format('Lot échu : %s — lot %s, %s %s restant(s) (%s %s). Action : retrait/destruction à documenter.',
               r.pname, r.lot_number, trim_scale(r.qty_remaining), r.punit, coalesce(r.expiry_kind,'DLC'), to_char(r.expiry_date,'DD/MM/YYYY')),
        r.product_id, r.id);
      n := n + 1;
    elsif v_days <= r.alert_days and r.status = 'active' then
      perform open_alert('expiry_soon','warning',
        format('%s — lot %s : %s %s, %s dans %s jour(s) (%s). Vente prioritaire / promotion ?',
               r.pname, r.lot_number, trim_scale(r.qty_remaining), r.punit, coalesce(r.expiry_kind,'DLC'), v_days, to_char(r.expiry_date,'DD/MM/YYYY')),
        r.product_id, r.id);
      n := n + 1;
    end if;
  end loop;
  -- fermer les alertes de lots vidés / détruits
  update alerts a set status = 'resolved', resolved_at = now(), resolution_note = 'Lot épuisé ou retiré'
  from lots l where a.lot_id = l.id and a.status = 'open' and a.type in ('expiry_soon','expired_lot')
    and (l.qty_remaining = 0 or l.status = 'depleted');
  return n;
end $$;

create or replace function resolve_alert(p_alert uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_staff();
  update alerts set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = coalesce(nullif(trim(p_note),''), 'Traitée')
  where id = p_alert and status = 'open';
end $$;

-- ---------------------------------------------------------------------
-- Mouvements de stock (réception, ajustement, inventaire)
-- ---------------------------------------------------------------------
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

-- delta signé ; motif obligatoire (STK-05)
create or replace function adjust_lot(p_lot uuid, p_delta numeric, p_type movement_type, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $$
declare l lots; v_new numeric;
begin
  perform require_staff();
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: motif obligatoire'; end if;
  if p_type in ('sale','reception') then raise exception 'INVALID_TYPE: utilisez la réception ou une commande'; end if;
  if p_delta = 0 then raise exception 'INVALID_QTY: quantité nulle'; end if;
  if p_type in ('loss','breakage','donation','destruction') and p_delta > 0 then p_delta := -p_delta; end if;
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'NOT_FOUND: lot'; end if;
  v_new := l.qty_remaining + p_delta;
  if v_new < 0 then raise exception 'NEGATIVE_STOCK: le lot ne contient que % unité(s)', trim_scale(l.qty_remaining); end if;
  update lots set qty_remaining = v_new,
         status = case when v_new = 0 then 'depleted'::lot_status
                       when l.status = 'depleted' and v_new > 0 then 'active'::lot_status else l.status end
  where id = p_lot;
  insert into stock_movements(lot_id, product_id, type, quantity, reason, user_id)
  values (p_lot, l.product_id, p_type, p_delta, p_reason, auth.uid());
  perform refresh_expiry_alerts();
  return v_new;
end $$;

-- Inventaire (STK-09) : saisie de la quantité comptée, écart enregistré
create or replace function inventory_count(p_lot uuid, p_counted numeric, p_reason text default 'Inventaire')
returns numeric language plpgsql security definer set search_path = public as $$
declare l lots; v_delta numeric;
begin
  perform require_staff();
  if p_counted < 0 then raise exception 'INVALID_QTY'; end if;
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'NOT_FOUND: lot'; end if;
  v_delta := p_counted - l.qty_remaining;
  if v_delta = 0 then
    insert into stock_movements(lot_id, product_id, type, quantity, reason, user_id)
    values (p_lot, l.product_id, 'inventory', 0, coalesce(p_reason,'Inventaire') || ' (aucun écart)', auth.uid());
    return 0;
  end if;
  update lots set qty_remaining = p_counted,
         status = case when p_counted = 0 then 'depleted'::lot_status
                       when l.status = 'depleted' then 'active'::lot_status else l.status end
  where id = p_lot;
  insert into stock_movements(lot_id, product_id, type, quantity, reason, user_id)
  values (p_lot, l.product_id, 'inventory', v_delta,
          format('%s : théorique %s, compté %s', coalesce(p_reason,'Inventaire'), trim_scale(l.qty_remaining), trim_scale(p_counted)), auth.uid());
  return v_delta;
end $$;

create or replace function set_lot_status(p_lot uuid, p_status lot_status, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare l lots;
begin
  perform require_staff();
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: motif obligatoire'; end if;
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'NOT_FOUND: lot'; end if;
  if p_status = 'active' and l.expiry_date is not null and l.expiry_date < (now() at time zone shop_tz())::date then
    raise exception 'EXPIRED: un lot échu ne peut pas être remis en vente';
  end if;
  update lots set status = p_status, notes = concat_ws(E'\n', l.notes, to_char(now(),'DD/MM/YYYY HH24:MI') || ' — ' || p_status || ' : ' || p_reason)
  where id = p_lot;
  insert into stock_movements(lot_id, product_id, type, quantity, reason, user_id)
  values (p_lot, l.product_id, 'correction', 0, format('Statut lot → %s : %s', p_status, p_reason), auth.uid());
  if p_status = 'blocked' then
    perform close_alert('expiry_soon', l.product_id, l.id, 'Lot bloqué : ' || p_reason);
  end if;
end $$;

create or replace function update_lot_info(p_lot uuid, p_supplier text, p_expiry date, p_expiry_kind text, p_unit_cost numeric, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_staff();
  update lots set supplier = p_supplier, expiry_date = p_expiry,
         expiry_kind = case when p_expiry is null then null else coalesce(p_expiry_kind,'DLC') end,
         unit_cost = p_unit_cost, notes = p_notes
  where id = p_lot;
  perform refresh_expiry_alerts();
end $$;

-- Traçabilité / rappel de lot (§11.3)
create or replace function lot_trace(p_lot uuid)
returns table(order_id uuid, order_number text, status order_status, customer text, email text, phone text, quantity numeric, ordered_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff();
  return query
  select o.id, o.order_number, o.status,
         coalesce(pr.full_name, o.guest_name), coalesce(pr.email, o.guest_email), coalesce(pr.phone, o.guest_phone),
         oil.quantity, o.created_at
  from order_item_lots oil
  join order_items oi on oi.id = oil.order_item_id
  join orders o on o.id = oi.order_id
  left join profiles pr on pr.id = o.customer_id
  where oil.lot_id = p_lot
  order by o.created_at desc;
end $$;

-- ---------------------------------------------------------------------
-- Créneaux
-- ---------------------------------------------------------------------
create or replace function slot_used(p_slot uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from orders o
  where o.slot_id = p_slot
    and o.status not in ('cancelled','refunded','delivery_failed')
    and not (o.status = 'pending_payment' and coalesce(o.reserved_until, now()) <= now())
$$;

create or replace function generate_slots(p_days int default 14) returns int
language plpgsql security definer set search_path = public as $$
declare v_tz text := shop_tz(); d date; t slot_templates; n int := 0; v_rows int;
begin
  if auth.uid() is not null then perform require_staff(); end if;
  for d in select generate_series((now() at time zone v_tz)::date, (now() at time zone v_tz)::date + p_days, interval '1 day')::date loop
    if exists (select 1 from closed_days where day = d) then continue; end if;
    for t in select * from slot_templates where active and weekday = extract(isodow from d)::int loop
      insert into slots(type, zone_id, starts_at, ends_at, capacity)
      values (t.type, t.zone_id, (d + t.start_time) at time zone v_tz, (d + t.end_time) at time zone v_tz, t.capacity)
      on conflict do nothing;
      get diagnostics v_rows = row_count; n := n + v_rows;
    end loop;
  end loop;
  return n;
end $$;

create or replace function find_zone(p_postal text) returns delivery_zones
language sql stable security definer set search_path = public as $$
  select * from delivery_zones
  where active and upper(replace(trim(p_postal),' ','')) = any(select upper(replace(trim(x),' ','')) from unnest(postal_codes) x)
  limit 1
$$;

create or replace function check_zone(p_postal text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when z.id is null then jsonb_build_object('ok', false)
         else jsonb_build_object('ok', true, 'zone_id', z.id, 'name', z.name, 'fee', z.fee,
                                 'min_order', z.min_order, 'free_above', z.free_above) end
  from (select (find_zone(p_postal)).*) z
$$;

create or replace function slot_bookable(s slots, p_type fulfillment_type, p_zone uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare st settings; v_tz text; v_local_start timestamp; v_now timestamp;
begin
  select * into st from settings where id = 1;
  v_tz := st.timezone;
  v_local_start := s.starts_at at time zone v_tz;
  v_now := now() at time zone v_tz;
  if s.status <> 'open' or s.type <> p_type then return false; end if;
  if s.zone_id is not null and s.zone_id is distinct from p_zone then return false; end if;
  if s.starts_at < now() + make_interval(hours => st.min_prep_hours) then return false; end if;
  if v_local_start::date = v_now::date and v_now::time > st.same_day_cutoff then return false; end if;
  if exists (select 1 from closed_days where day = v_local_start::date) then return false; end if;
  return slot_used(s.id) < s.capacity;
end $$;

create or replace function available_slots(p_type fulfillment_type, p_postal text default null)
returns table(id uuid, starts_at timestamptz, ends_at timestamptz, remaining int, zone_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_zone uuid;
begin
  if p_type = 'delivery' then
    v_zone := (find_zone(p_postal)).id;
    if v_zone is null then return; end if;
  end if;
  return query
  select s.id, s.starts_at, s.ends_at, (s.capacity - slot_used(s.id))::int, s.zone_id
  from slots s
  where s.starts_at > now() and s.starts_at < now() + interval '15 days'
    and slot_bookable(s, p_type, v_zone)
  order by s.starts_at;
end $$;

-- ---------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------
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

create or replace function enqueue_order_notification(p_order uuid, p_event text, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; v_to text;
begin
  select * into o from orders where id = p_order;
  select coalesce(pr.email, o.guest_email) into v_to from orders x left join profiles pr on pr.id = x.customer_id where x.id = p_order;
  insert into notifications(event, recipient, channel, order_id, subject, body, status)
  values (p_event, v_to, 'email', p_order, p_subject, p_body, case when v_to is null then 'skipped' else 'pending' end);
end $$;

-- Recalcul serveur des totaux (§7.1 : calcul total côté serveur)
create or replace function recompute_order_totals(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_sub numeric; v_tax numeric; o orders; z delivery_zones; v_fee numeric := 0;
begin
  select * into o from orders where id = p_order for update;
  select coalesce(sum(line_total) filter (where not unavailable),0),
         coalesce(sum(round(line_total - line_total / (1 + tax_rate/100), 2)) filter (where not unavailable),0)
  into v_sub, v_tax from order_items where order_id = p_order;
  if o.fulfillment = 'delivery' and o.zone_id is not null then
    select * into z from delivery_zones where id = o.zone_id;
    v_fee := case when z.free_above is not null and v_sub >= z.free_above then 0 else z.fee end;
  end if;
  update orders set subtotal = v_sub, tax_total = v_tax, delivery_fee = v_fee,
         total = greatest(v_sub + v_fee - discount, 0) where id = p_order;
end $$;

-- Allocation FEFO d'une quantité pour une ligne de commande (interne).
-- p_strict = true : erreur si stock insuffisant ; false : prend ce qui est disponible.
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

-- Remise en stock d'une quantité allouée à une ligne (derniers lots alloués d'abord, interne)
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

-- Déstockage FEFO (STK-04) — appelé uniquement en interne
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

-- Réintégration du stock dans les lots d'origine
create or replace function restock_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select oil.*, oi.product_id from order_item_lots oil join order_items oi on oi.id = oil.order_item_id
           where oi.order_id = p_order loop
    update lots set qty_remaining = qty_remaining + r.quantity,
           status = case when status = 'depleted' then 'active'::lot_status else status end
    where id = r.lot_id;
    insert into stock_movements(lot_id, product_id, type, quantity, reason, order_id, user_id)
    values (r.lot_id, r.product_id, 'return_restock', r.quantity, p_reason, p_order, auth.uid());
  end loop;
  delete from order_item_lots where order_item_id in (select id from order_items where order_id = p_order);
  update orders set stock_committed = false where id = p_order;
  perform refresh_expiry_alerts();
end $$;

/*
  p = {
    items: [{product_id, quantity}], fulfillment: 'delivery'|'pickup',
    street, city, postal_code, instructions, slot_id,
    payment_method: 'cash_on_delivery'|'mobile_money_on_delivery'|'online',
    guest_name, guest_email, guest_phone, note, accept_terms: true, save_address: bool
  }
*/
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

-- Libère les réservations expirées (paiement non reçu) — idempotent
create or replace function release_expired_reservations() returns int
language plpgsql security definer set search_path = public as $$
declare r orders; n int := 0;
begin
  for r in select * from orders where status = 'pending_payment' and not stock_committed
           and reserved_until is not null and reserved_until <= now() for update skip locked loop
    update orders set status = 'cancelled', cancel_reason = 'Réservation expirée (paiement non reçu)',
           payment_status = case when payment_status = 'pending' then 'failed' else payment_status end
    where id = r.id;
    insert into order_status_history(order_id, from_status, to_status, note)
    values (r.id, 'pending_payment', 'cancelled', 'Réservation expirée');
    perform enqueue_order_notification(r.id, 'order_expired', 'Commande ' || r.order_number || ' non finalisée',
      'Le paiement n''a pas été reçu à temps : la réservation a été libérée.');
    n := n + 1;
  end loop;
  return n;
end $$;

/* Confirmation de paiement — idempotente (T06).
   Utilisée par le personnel (encaissement à la remise, paiement en ligne vérifié)
   et, plus tard, par le webhook du prestataire (Edge Function avec clé service). */
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

create or replace function fail_payment(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  perform require_staff();
  select * into o from orders where id = p_order for update;
  if o.status <> 'pending_payment' then raise exception 'INVALID_STATE'; end if;
  update orders set payment_status = 'failed', status = 'cancelled', cancel_reason = 'Paiement refusé : ' || coalesce(p_reason,''),
         reserved_until = null where id = p_order;
  insert into order_status_history(order_id, from_status, to_status, note, user_id)
  values (p_order, 'pending_payment', 'cancelled', 'Paiement refusé : ' || coalesce(p_reason,''), auth.uid());
  perform open_alert('payment_failed','warning', 'Paiement refusé — commande ' || o.order_number, null, null, p_order);
  perform enqueue_order_notification(p_order, 'payment_failed', 'Paiement refusé — commande ' || o.order_number,
    'Votre paiement n''a pas abouti. La réservation a été libérée.');
end $$;

-- Transitions de statut contrôlées (§4.4)
create or replace function set_order_status(p_order uuid, p_status order_status, p_note text default null, p_restock boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; v_ok boolean; v_restock boolean; v_label text;
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
    failure_reason = case when p_status = 'delivery_failed' then p_note else failure_reason end,
    cancel_reason = case when p_status = 'cancelled' then p_note else cancel_reason end,
    payment_status = case when p_status = 'refunded' then 'refunded'
                          when p_status = 'partially_refunded' then 'partially_refunded' else payment_status end,
    reserved_until = case when p_status = 'cancelled' then null else reserved_until end,
    assigned_to = coalesce(assigned_to, case when p_status in ('preparing','out_for_delivery') then auth.uid() end)
  where id = p_order;

  insert into order_status_history(order_id, from_status, to_status, note, user_id)
  values (p_order, o.status, p_status, p_note, auth.uid());

  if p_status in ('ready','out_for_delivery','delivered','cancelled','delivery_failed','refunded','partially_refunded') then
    v_label := case p_status
      when 'ready' then case when o.fulfillment = 'pickup' then 'prête au retrait' else 'prête' end
      when 'out_for_delivery' then 'en cours de livraison' when 'delivered' then 'livrée / retirée'
      when 'cancelled' then 'annulée' when 'delivery_failed' then 'livraison impossible'
      when 'refunded' then 'remboursée' else 'partiellement remboursée' end;
    perform enqueue_order_notification(p_order, 'status_' || p_status,
      'Commande ' || o.order_number || ' : ' || v_label, coalesce(p_note, ''));
  end if;
end $$;

-- Préparation : ligne cochée, poids réel, produit manquant (§6.5)
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

create or replace function update_order_meta(p_order uuid, p_internal_note text, p_assigned_to uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_staff();
  update orders set internal_note = p_internal_note, assigned_to = p_assigned_to where id = p_order;
end $$;

create or replace function move_order_slot(p_order uuid, p_slot uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; s slots;
begin
  perform require_staff();
  select * into o from orders where id = p_order for update;
  select * into s from slots where id = p_slot for update;
  if not found then raise exception 'NOT_FOUND: créneau'; end if;
  if s.type <> o.fulfillment or (s.zone_id is not null and s.zone_id is distinct from o.zone_id) then
    raise exception 'INVALID_SLOT: créneau incompatible';
  end if;
  if slot_used(s.id) >= s.capacity then raise exception 'SLOT_FULL: créneau complet'; end if;
  update orders set slot_id = p_slot where id = p_order;
  insert into order_status_history(order_id, from_status, to_status, note, user_id)
  values (p_order, o.status, o.status, 'Créneau déplacé au ' || to_char(s.starts_at at time zone shop_tz(),'DD/MM HH24:MI') || coalesce(' — ' || p_note,''), auth.uid());
  perform enqueue_order_notification(p_order, 'slot_moved', 'Commande ' || o.order_number || ' : nouveau créneau',
    'Votre créneau a été déplacé au ' || to_char(s.starts_at at time zone shop_tz(),'DD/MM/YYYY à HH24:MI') || '. ' || coalesce(p_note,''));
end $$;

-- Suivi de commande pour un invité (numéro + téléphone ou e-mail)
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

create or replace function send_slot_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_tz text := shop_tz();
begin
  for r in select o.id, o.order_number, s.starts_at, s.ends_at from orders o join slots s on s.id = o.slot_id
           where o.status in ('confirmed','preparing','ready')
             and (s.starts_at at time zone v_tz)::date = (now() at time zone v_tz)::date + 1
             and not exists (select 1 from notifications n where n.order_id = o.id and n.event = 'slot_reminder') loop
    perform enqueue_order_notification(r.id, 'slot_reminder', 'Rappel : votre créneau BENDO BIO demain',
      'Commande ' || r.order_number || ' — créneau le ' || to_char(r.starts_at at time zone v_tz,'DD/MM/YYYY de HH24:MI') ||
      ' à ' || to_char(r.ends_at at time zone v_tz,'HH24:MI') || '.');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Cœur des tâches automatiques (appelé par pg_cron ou par le tableau de bord)
create or replace function _run_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; p record; v_late int;
begin
  for p in select id from products where status = 'active' loop perform refresh_product_alerts(p.id); end loop;
  -- commandes en retard (créneau terminé mais pas livrée)
  insert into alerts(type, level, message, order_id)
  select 'order_late','warning','Commande en retard : ' || o.order_number, o.id
  from orders o join slots s on s.id = o.slot_id
  where s.ends_at < now() and o.status in ('confirmed','preparing','ready','out_for_delivery')
  on conflict do nothing;
  get diagnostics v_late = row_count;
  update alerts a set status = 'resolved', resolved_at = now(), resolution_note = 'Commande traitée'
  from orders o where a.order_id = o.id and a.type = 'order_late' and a.status = 'open'
    and o.status not in ('confirmed','preparing','ready','out_for_delivery');
  v := jsonb_build_object(
    'released_reservations', release_expired_reservations(),
    'expiry_alerts', refresh_expiry_alerts(),
    'late_orders', v_late,
    'slots_created', generate_slots(14),
    'reminders', send_slot_reminders());
  insert into job_runs(job, details) values ('maintenance', v);
  return v;
end $$;

-- Version appelable depuis l'application (personnel), au plus toutes les 10 min
create or replace function run_maintenance(p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform require_staff();
  if not p_force and exists (select 1 from job_runs where job = 'maintenance' and ran_at > now() - interval '10 minutes') then
    return jsonb_build_object('skipped', true);
  end if;
  return _run_jobs();
end $$;

-- Ping public : mesure de latence et vérification du lien avec la base
create or replace function ping() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'server_time', now(), 'schema_version', '1.0.0')
$$;

-- Diagnostic complet pour la page Paramètres (admin)
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

-- RGPD : traitement d'une demande d'effacement (anonymisation, pièces légales conservées)
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
-- Droits d'exécution : fonctions internes non exposées à l'API
-- ---------------------------------------------------------------------
revoke execute on function commit_order_stock(uuid) from public, anon, authenticated;
revoke execute on function allocate_item_fefo(uuid, numeric, boolean, text) from public, anon, authenticated;
revoke execute on function release_item_qty(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function restock_order(uuid, text) from public, anon, authenticated;
revoke execute on function recompute_order_totals(uuid) from public, anon, authenticated;
revoke execute on function open_alert(text, alert_level, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function close_alert(text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function enqueue_order_notification(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function _run_jobs() from public, anon, authenticated;
revoke execute on function refresh_expiry_alerts() from public, anon, authenticated;
revoke execute on function refresh_product_alerts(uuid) from public, anon, authenticated;
revoke execute on function send_slot_reminders() from public, anon, authenticated;
revoke execute on function generate_slots(int) from public, anon;
revoke execute on function handle_new_user() from public, anon, authenticated;
