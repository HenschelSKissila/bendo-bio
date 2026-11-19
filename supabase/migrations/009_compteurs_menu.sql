-- =====================================================================
-- BENDO BIO — Mise à jour 009 : compteurs « nouveautés » dans le menu de gestion
--  · Pour chaque membre de l'équipe : ce qui est nouveau depuis SA dernière visite de chaque rubrique
--    (commandes, clients, produits, stock, demandes d'accès) + éléments « à traiter ».
--  · Mise à jour en temps réel (nouvelles inscriptions comprises).
-- À exécuter UNE fois après 008, dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- =====================================================================

create table if not exists staff_seen (
  user_id uuid not null references profiles(id) on delete cascade,
  section text not null check (section in ('orders','customers','products','stock','users','alerts')),
  seen_at timestamptz not null default now(),
  primary key (user_id, section)
);
alter table staff_seen enable row level security;
drop policy if exists staff_seen_own on staff_seen;
create policy staff_seen_own on staff_seen for select using (user_id = auth.uid());
grant select on staff_seen to authenticated;

-- Compteurs du menu (nouveautés depuis la dernière visite + choses à faire)
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
    'unassigned_deliveries', (select count(*) from orders where fulfillment = 'delivery' and courier_id is null
                               and status in ('confirmed','preparing','ready')),
    'since', jsonb_build_object('orders', s_orders, 'customers', s_customers, 'products', s_products, 'stock', s_stock));
end $$;

-- Marque une rubrique comme vue (appelé à l'ouverture de la page)
create or replace function mark_section_seen(p_section text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_staff();
  insert into staff_seen(user_id, section, seen_at) values (auth.uid(), p_section, now())
  on conflict (user_id, section) do update set seen_at = now();
end $$;

-- Temps réel : nouvelles inscriptions visibles immédiatement par l'équipe
do $$ declare t text; begin
  foreach t in array array['profiles','data_requests'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Nouvelle inscription client : notification pour l'équipe (push + tableau de bord)
create or replace function notify_new_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'client' and new.requested_role is null then
    insert into notifications(event, recipient, channel, subject, body, status, sent_at)
    values ('new_customer', 'staff', 'dashboard', 'Nouveau client inscrit',
            coalesce(new.full_name, new.email, 'Un client') || coalesce(' — ' || new.phone, '') || ' vient de créer son compte.', 'sent', now());
  end if;
  return new;
end $$;
drop trigger if exists profiles_new_customer on profiles;
create trigger profiles_new_customer after insert on profiles for each row execute function notify_new_customer();

revoke execute on function staff_badges() from public, anon;
revoke execute on function mark_section_seen(text) from public, anon;
revoke execute on function notify_new_customer() from public, anon, authenticated;
grant execute on function staff_badges() to authenticated;
grant execute on function mark_section_seen(text) to authenticated;
notify pgrst, 'reload schema';
