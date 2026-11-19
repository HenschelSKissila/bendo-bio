-- Scénario de test métier (base locale avec schéma auth simulé, PAS sur la production).
-- Vérifie : premier admin, réception, FEFO, survente, zone, réservation, paiement idempotent,
-- transitions de statut, réintégration, alertes, journal immuable.
\set QUIET on
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com','{"full_name":"Admin"}'),
 ('22222222-2222-2222-2222-222222222222','emp@x.com','{"full_name":"Emp"}'),
 ('33333333-3333-3333-3333-333333333333','cli@x.com','{"full_name":"Cli"}');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select 'claim1', claim_first_admin();
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select 'claim2 (should be false)', claim_first_admin();
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select admin_set_user('22222222-2222-2222-2222-222222222222','employee',true);
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \g /dev/null
-- employee receives stock
select receive_stock((select id from products where sku='LEG-TOM-001'), 5, 'T-A', current_date+10, 'DLC','Ferme A', 1.5) as lot_a \gset
select receive_stock((select id from products where sku='LEG-TOM-001'), 3, 'T-B', current_date+1, 'DLC','Ferme B', 1.5) as lot_b \gset
select 'stock', * from product_stock() where product_id=(select id from products where sku='LEG-TOM-001');
select 'alerts', type, level, message from alerts where status='open' order by type;
-- employee tries to change price -> should fail
do $$ begin update products set price = 1 where sku='LEG-TOM-001'; raise notice 'PRICE CHANGE ALLOWED (BAD)'; exception when others then raise notice 'price guard ok: %', sqlerrm; end $$;
-- client order delivery
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select 'clientsees lots?', count(*) from lots;
select id as slot from slots where type='delivery' and starts_at > now() + interval '1 day' order by starts_at limit 1 \gset
select 'avail slots', count(*) from available_slots('delivery','Lumumba');
select 'zone', check_zone('lumumba');
select place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='LEG-TOM-001'),'quantity',4)),
  'fulfillment','delivery','street','1 rue A','city','Paris','postal_code','Lumumba','slot_id',:'slot','payment_method','cash_on_delivery','accept_terms',true,'guest_phone','0600000000','save_address',true)) as o1 \gset
select 'order1', :'o1';
select 'my orders', order_number, status, subtotal, delivery_fee, total, stock_committed from orders;
reset role;
select 'lots after FEFO', lot_number, qty_remaining, status from lots order by lot_number;
select 'oil', l.lot_number, oil.quantity from order_item_lots oil join lots l on l.id=oil.lot_id;
-- oversell attempt
set role authenticated;
do $$ begin perform place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='LEG-TOM-001'),'quantity',50)),
  'fulfillment','pickup','slot_id',(select id from slots where type='pickup' and starts_at>now()+interval '1 day' order by starts_at limit 1),'payment_method','cash_on_delivery','accept_terms',true));
  raise notice 'OVERSELL ALLOWED (BAD)'; exception when others then raise notice 'oversell blocked: %', sqlerrm; end $$;
-- out of zone
do $$ begin perform place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='LEG-TOM-001'),'quantity',1)),
  'fulfillment','delivery','street','x','city','y','postal_code','99999','slot_id',(select id from slots limit 1),'payment_method','cash_on_delivery','accept_terms',true));
  exception when others then raise notice 'zone: %', sqlerrm; end $$;
-- online payment reserve
select place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='LEG-TOM-001'),'quantity',1)),
  'fulfillment','pickup','slot_id',(select id from slots where type='pickup' and starts_at>now()+interval '1 day' order by starts_at limit 1),'payment_method','online','accept_terms',true))->>'id' as o2 \gset
select 'stock w/ reservation', physical, sellable, reserved, available from product_stock() where product_id=(select id from products where sku='LEG-TOM-001');
-- client tries confirm_payment -> forbidden
do $$ begin perform confirm_payment((select id from orders where payment_method='online' limit 1)); raise notice 'BAD'; exception when others then raise notice 'client confirm blocked: %', sqlerrm; end $$;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \g /dev/null
select 'pay1', confirm_payment(:'o2','stripe','evt_1');
select 'pay2 dup', confirm_payment(:'o2','stripe','evt_1');
select 'payments', count(*) from payments;
-- status flow
select set_order_status(:'o2','preparing');
do $$ begin perform set_order_status((select id from orders where payment_method='online' limit 1),'out_for_delivery'); exception when others then raise notice 'transition: %', sqlerrm; end $$;
do $$ begin perform set_order_status((select id from orders where payment_method='online' limit 1),'cancelled','client absent'); exception when others then raise notice 'restock decision: %', sqlerrm; end $$;
select set_order_status(:'o2','cancelled','Client a annulé', true);
select 'after cancel', lot_number, qty_remaining, status from lots order by lot_number;
select 'movements', type, quantity, reason from stock_movements order by id;
select 'alerts', type, level, status from alerts order by created_at;
select 'stats', dashboard_stats(current_date-7, current_date);
select 'health', system_health()->'counts';
select 'maint', run_maintenance(true);
reset role;
do $$ begin update stock_movements set quantity=0; raise notice 'BAD'; exception when others then raise notice 'immutable: %', sqlerrm; end $$;
select 'track', track_order((select order_number from orders limit 1), '06 00 00 00 00') is not null;
select 'audit count', count(*) from audit_log;
