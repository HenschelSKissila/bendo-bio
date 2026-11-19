-- =====================================================================
-- BENDO BIO — Droits d'accès de l'API (anon / authenticated)
-- Nécessaire sur les projets Supabase récents, où les nouvelles tables
-- ne sont plus exposées automatiquement à l'API ("permission denied for table").
-- La protection reste assurée ligne par ligne par les règles RLS (script 003).
-- Script ré-exécutable sans risque.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Lecture : RLS décide ensuite ce que chacun voit réellement
grant select on all tables in schema public to anon, authenticated;
-- Écriture : uniquement les utilisateurs connectés (RLS + fonctions contrôlent le reste)
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Fonctions appelables depuis l'application (chacune vérifie le rôle en interne)
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Fonctions internes : jamais appelables directement depuis l'API
revoke execute on function commit_order_stock(uuid) from public, anon, authenticated;
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

-- Tables créées plus tard : mêmes droits automatiquement
alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- Comptes créés avant l'installation des scripts : création du profil manquant
insert into profiles (id, email, full_name, phone)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)), u.raw_user_meta_data->>'phone'
from auth.users u
on conflict (id) do nothing;

-- Recharge le cache de l'API pour prise en compte immédiate
notify pgrst, 'reload schema';
