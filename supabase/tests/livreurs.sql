-- Parcours livreur (base locale uniquement)
\set QUIET on
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com','{"full_name":"Admin"}'),
 ('55555555-5555-5555-5555-555555555555','jean@x.com','{"full_name":"Jean Livreur","requested_role":"courier"}'),
 ('66666666-6666-6666-6666-666666666666','paul@x.com','{"full_name":"Paul Livreur","requested_role":"courier"}'),
 ('77777777-7777-7777-7777-777777777777','pirate@x.com','{"full_name":"Pirate","requested_role":"admin"}'),
 ('33333333-3333-3333-3333-333333333333','cliente@x.com','{"full_name":"Mme Okemba","phone":"06 444 55 66"}');
update profiles set role='admin' where email='admin@x.com';
select 'DEMANDES', email, role, requested_role from profiles where email in ('jean@x.com','pirate@x.com') order by email;
set role authenticated;
-- un livreur non validé n'a pas accès
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
do $$ begin perform courier_board(); raise notice 'ÉCHEC'; exception when others then raise notice 'non validé bloqué : %', sqlerrm; end $$;
-- l'admin valide les deux livreurs
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select admin_set_user('55555555-5555-5555-5555-555555555555','courier',true) \g /dev/null
select admin_set_user('66666666-6666-6666-6666-666666666666','courier',true) \g /dev/null
select receive_stock((select id from products where sku='LEG-OIG-001'), 40, 'O-1', current_date+20) \g /dev/null
-- une cliente commande (livraison à Mvoumvou)
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='LEG-OIG-001'),'quantity',3)),
  'fulfillment','delivery','street','Rue Mbochi n°12','city','Pointe-Noire','postal_code','Mvoumvou','instructions','Portail bleu',
  'slot_id',(select id from available_slots('delivery','Mvoumvou') limit 1),'payment_method','cash_on_delivery','accept_terms',true,'guest_name','Mme Okemba','guest_phone','06 444 55 66'))->>'id' as oid \gset
reset role;
select 'DING nouvelle livraison', count(*) from notifications where event='courier_new';
set role authenticated;
-- Jean voit la livraison, sans adresse ni téléphone
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
select 'JEAN voit dispo', b->'available'->0->>'area', b->'available'->0->>'delivery_fee', b->'available'->0->>'subtotal', b->'available'->0 ? 'phone' as voit_tel from (select courier_board() b) x;
-- Jean et Paul cliquent : un seul gagne
select courier_claim(:'oid') \g /dev/null
select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',false) \g /dev/null
do $$ begin perform courier_claim((select id from orders order by created_at desc limit 1)); raise notice 'ÉCHEC'; exception when others then raise notice 'Paul : %', sqlerrm; end $$;
select 'PAUL voit encore', jsonb_array_length(courier_board()->'available');
-- Paul ne peut pas agir sur la livraison de Jean
do $$ begin perform set_order_status((select id from orders order by created_at desc limit 1),'out_for_delivery'); raise notice 'ÉCHEC'; exception when others then raise notice 'Paul action refusée : %', sqlerrm; end $$;
-- l'équipe prépare, la commande est prête → Jean reçoit « Ding »
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select set_order_status(:'oid','preparing') \g /dev/null
select set_order_status(:'oid','ready') \g /dev/null
reset role;
select 'DING prête', u.email, n.body from notifications n join profiles u on u.id = n.user_id where n.event='courier_ready';
set role authenticated;
-- Jean : adresse complète, départ, quartier, livraison, encaissement
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
select 'JEAN mine', b->'mine'->0->>'street', b->'mine'->0->>'phone', b->'mine'->0->>'instructions' from (select courier_board() b) x;
select set_order_status(:'oid','out_for_delivery') \g /dev/null
select notify_order_event(:'oid','nearby') \g /dev/null
select set_order_status(:'oid','delivered', null, null, 'Mme Okemba (en personne)') \g /dev/null
select confirm_payment(:'oid','especes',null,null) \g /dev/null
do $$ begin perform set_order_status((select id from orders order by created_at desc limit 1),'refunded','test'); raise notice 'ÉCHEC'; exception when others then raise notice 'remboursement refusé au livreur : %', sqlerrm; end $$;
do $$ begin perform count(*) from orders; raise notice 'orders lisibles par livreur : %', (select count(*) from orders); end $$;
select 'JEAN historique', b->'history'->0->>'received_by', b->'stats' from (select courier_board() b) x;
-- la cliente voit tout
reset role;
select 'CLIENTE', subject from notifications where user_id='33333333-3333-3333-3333-333333333333' order by id;
