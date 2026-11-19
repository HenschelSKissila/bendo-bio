-- Tests des correctifs de la revue (à lancer après scenario.sql, base locale uniquement)
\set QUIET on
reset role;
insert into auth.users(id,email) values ('44444444-4444-4444-4444-444444444444','client2@x.com') on conflict do nothing;
update profiles set role='employee' where email='emp@x.com';
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \g /dev/null
select receive_stock((select id from products where sku='FRU-POM-001'), 20, 'P-A', current_date+10) \g /dev/null
select receive_stock((select id from products where sku='LEG-AUB-001'), 10, 'AU-A', current_date+10) \g /dev/null
-- 1. pas de quantité : 1,5 aubergine refusée
do $$ begin perform place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='LEG-AUB-001'),'quantity',1.5)),
  'fulfillment','pickup','slot_id',(select id from available_slots('pickup') limit 1),'payment_method','cash_on_delivery','accept_terms',true));
  raise notice 'T-PAS : ÉCHEC (accepté)'; exception when others then raise notice 'T-PAS ok : %', sqlerrm; end $$;
-- commande : 2 kg pommes + 3 aubergines
select place_order(jsonb_build_object('items', jsonb_build_array(
   jsonb_build_object('product_id',(select id from products where sku='FRU-POM-001'),'quantity',2),
   jsonb_build_object('product_id',(select id from products where sku='LEG-AUB-001'),'quantity',3)),
  'fulfillment','pickup','slot_id',(select id from available_slots('pickup') limit 1),'payment_method','cash_on_delivery','accept_terms',true,'guest_phone','0611223344'))->>'id' as oid \gset
-- 2. poids réel 2,4 kg : stock pommes doit passer de 18 à 17,6
select update_order_item((select id from order_items where order_id=:'oid' and product_sku='FRU-POM-001'), null, 2.4) \g /dev/null
select 'T-POIDS+ pommes restantes (attendu 17.6)', trim_scale(qty_remaining) from lots where lot_number='P-A';
select update_order_item((select id from order_items where order_id=:'oid' and product_sku='FRU-POM-001'), null, 1.9) \g /dev/null
select 'T-POIDS- pommes restantes (attendu 18.1)', trim_scale(qty_remaining) from lots where lot_number='P-A';
-- 3. ligne aubergines manquante puis rétablie : 7 → 10 → 7
select update_order_item((select id from order_items where order_id=:'oid' and product_sku='LEG-AUB-001'), null, null, true, 'rupture test') \g /dev/null
select 'T-LIGNE retirée (attendu 10)', trim_scale(qty_remaining) from lots where lot_number='AU-A';
select update_order_item((select id from order_items where order_id=:'oid' and product_sku='LEG-AUB-001'), null, null, false, 'retrouvées') \g /dev/null
select 'T-LIGNE rétablie (attendu 7)', trim_scale(qty_remaining) from lots where lot_number='AU-A';
select 'T-TOTAL commande', subtotal, total from orders where id=:'oid';
-- 4. suivi de commande
reset role; set role anon;
select set_config('request.jwt.claims','{"role":"anon"}',false) \g /dev/null
select 'T-SUIVI "abcd" (attendu vide)', coalesce(track_order((select order_number from orders where id=:'oid'), 'abcd')::text, 'refusé');
select 'T-SUIVI bon téléphone (attendu ok)', track_order((select order_number from orders where id=:'oid'), '06 11 22 33 44') is not null;
-- 5. RGPD : e-mail d'un tiers refusé
reset role; set role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false) \g /dev/null
select set_config('request.jwt.claims','{"role":"authenticated","email":"client2@x.com"}',false) \g /dev/null
do $$ begin insert into data_requests(user_id,email,kind) values (auth.uid(),'victime@x.com','erasure');
  raise notice 'T-RGPD : ÉCHEC (accepté)'; exception when others then raise notice 'T-RGPD ok (refusé) : %', sqlerrm; end $$;
insert into data_requests(user_id,email,kind) values (auth.uid(),'client2@x.com','access');
select 'T-RGPD propre e-mail accepté', count(*) from data_requests;
-- 6. notifications tableau de bord
reset role;
select 'T-NOTIF dashboard en attente (attendu 0)', count(*) from notifications where channel='dashboard' and status='pending';
