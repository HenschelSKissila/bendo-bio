-- =====================================================================
-- BENDO BIO — Sécurité (Row Level Security), temps réel, stockage photos
-- =====================================================================

do $$ declare t text; begin
  foreach t in array array['settings','profiles','addresses','categories','products','lots','stock_movements',
    'delivery_zones','slot_templates','slots','closed_days','orders','order_items','order_item_lots','payments',
    'order_status_history','alerts','notifications','audit_log','data_requests','job_runs'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Supprime les anciennes politiques pour rendre le script ré-exécutable
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- settings : lecture publique (textes légaux, devise), modification admin
create policy settings_read on settings for select using (true);
create policy settings_admin on settings for update using (is_admin()) with check (is_admin());

-- profiles
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_staff());
create policy profiles_self_update on profiles for update using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

-- addresses
create policy addresses_own on addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy addresses_staff_read on addresses for select using (is_staff());

-- catalogue
create policy categories_read on categories for select using (active or is_staff());
create policy categories_staff_write on categories for insert with check (is_staff());
create policy categories_staff_update on categories for update using (is_staff()) with check (is_staff());
create policy categories_admin_delete on categories for delete using (is_admin());

create policy products_read on products for select using (status <> 'hidden' or is_staff());
create policy products_staff_insert on products for insert with check (is_staff());
create policy products_staff_update on products for update using (is_staff()) with check (is_staff());
create policy products_admin_delete on products for delete using (is_admin());

-- stock : lecture personnel ; écriture uniquement via fonctions (traçabilité)
create policy lots_staff_read on lots for select using (is_staff());
create policy movements_staff_read on stock_movements for select using (is_staff());
create policy oil_staff_read on order_item_lots for select using (is_staff());

-- zones / créneaux
create policy zones_read on delivery_zones for select using (active or is_staff());
create policy zones_admin on delivery_zones for all using (is_admin()) with check (is_admin());
create policy templates_staff_read on slot_templates for select using (is_staff());
create policy templates_admin on slot_templates for all using (is_admin()) with check (is_admin());
create policy slots_read on slots for select using (true);
create policy slots_staff_insert on slots for insert with check (is_staff());
create policy slots_staff_update on slots for update using (is_staff()) with check (is_staff());
create policy slots_admin_delete on slots for delete using (is_admin());
create policy closed_read on closed_days for select using (true);
create policy closed_staff on closed_days for all using (is_staff()) with check (is_staff());

-- commandes : le client ne voit que les siennes ; écriture via fonctions
create policy orders_read on orders for select using (customer_id = auth.uid() or is_staff());
create policy items_read on order_items for select using (
  is_staff() or exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy payments_read on payments for select using (
  is_staff() or exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy history_read on order_status_history for select using (
  is_staff() or exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));

-- alertes / notifications / audit
create policy alerts_staff_read on alerts for select using (is_staff());
create policy notif_staff_read on notifications for select using (is_staff());
create policy notif_admin_update on notifications for update using (is_admin()) with check (is_admin());
create policy audit_admin_read on audit_log for select using (is_admin());
create policy jobs_staff_read on job_runs for select using (is_staff());

-- RGPD
create policy dr_insert on data_requests for insert with check (auth.uid() is not null and user_id = auth.uid());
create policy dr_read on data_requests for select using (user_id = auth.uid() or is_admin());
create policy dr_admin_update on data_requests for update using (is_admin()) with check (is_admin());

-- Les vues/fonctions publiques nécessaires au catalogue
grant execute on function product_stock() to anon, authenticated;
grant execute on function available_slots(fulfillment_type, text) to anon, authenticated;
grant execute on function check_zone(text) to anon, authenticated;
grant execute on function place_order(jsonb) to anon, authenticated;
grant execute on function track_order(text, text) to anon, authenticated;
grant execute on function ping() to anon, authenticated;
grant execute on function admin_exists() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Temps réel : l'application est notifiée instantanément des changements
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['orders','alerts','lots','stock_movements','notifications','slots','products'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Stockage des photos produits (bucket public en lecture, écriture personnel)
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('product-images','product-images', true)
    on conflict (id) do nothing;
    execute 'drop policy if exists "bendo images read" on storage.objects';
    execute 'drop policy if exists "bendo images staff insert" on storage.objects';
    execute 'drop policy if exists "bendo images staff update" on storage.objects';
    execute 'drop policy if exists "bendo images staff delete" on storage.objects';
    execute $p$create policy "bendo images read" on storage.objects for select using (bucket_id = 'product-images')$p$;
    execute $p$create policy "bendo images staff insert" on storage.objects for insert with check (bucket_id = 'product-images' and public.is_staff())$p$;
    execute $p$create policy "bendo images staff update" on storage.objects for update using (bucket_id = 'product-images' and public.is_staff())$p$;
    execute $p$create policy "bendo images staff delete" on storage.objects for delete using (bucket_id = 'product-images' and public.is_staff())$p$;
  end if;
end $$;
