-- Code de livraison + messagerie (base locale uniquement)
\set QUIET on
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com','{"full_name":"Admin"}'),
 ('55555555-5555-5555-5555-555555555555','jean@x.com','{"full_name":"Jean Livreur"}'),
 ('33333333-3333-3333-3333-333333333333','cliente@x.com','{"full_name":"Mme Mabiala","phone":"06 111 22 33","marketing_consent":true}'),
 ('44444444-4444-4444-4444-444444444444','autre@x.com','{"full_name":"M. Sans offres"}');
update profiles set role='admin' where email='admin@x.com';
update profiles set role='courier' where email='jean@x.com';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select receive_stock((select id from products where sku='LEG-TOM-001'), 30, 'T-1', current_date+5) \g /dev/null
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='LEG-TOM-001'),'quantity',2)),
  'fulfillment','delivery','street','Rue A','city','Pointe-Noire','postal_code','Lumumba','slot_id',(select id from available_slots('delivery','Lumumba') limit 1),
  'payment_method','cash_on_delivery','accept_terms',true,'guest_name','Mme Mabiala','guest_phone','06 111 22 33'))->>'id' as oid \gset
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
select courier_claim(:'oid') \g /dev/null
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select set_order_status(:'oid','preparing') \g /dev/null
select set_order_status(:'oid','ready') \g /dev/null
-- le livreur part : le code est généré et envoyé à la cliente
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
select set_order_status(:'oid','out_for_delivery') \g /dev/null
select 'LIVREUR voit le code ?', count(*) from delivery_codes;
select 'LIVREUR voit la notif cliente ?', count(*) from notifications where body like '%CODE DE LIVRAISON%';
do $$ begin perform set_order_status((select id from orders limit 1),'delivered',null,null,'X'); raise notice 'ÉCHEC'; exception when others then raise notice 'livreur sans code : %', sqlerrm; end $$;
select 'ESSAI faux code', courier_confirm_delivery(:'oid','AAAAAA', 'Mme Mabiala (en personne)');
-- la cliente voit son code
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select my_delivery_code(:'oid')->>'code' as code \gset
select 'CLIENTE voit son code', :'code', length(:'code');
select 'NOTIF cliente', body from notifications where user_id='33333333-3333-3333-3333-333333333333' and event='status_out_for_delivery' and channel='app';
-- le livreur saisit le bon code (minuscules + espace tolérés)
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
select 'BON code', courier_confirm_delivery(:'oid', lower(left(:'code',3)) || ' ' || lower(right(:'code',3)), 'Mme Mabiala (en personne)');
reset role;
select 'COMMANDE', status, received_by from orders where id=:'oid';
select 'HISTORIQUE', note from order_status_history where order_id=:'oid' and to_status='delivered';
-- verrouillage après 5 erreurs (nouvelle commande)
select 'UNIFORMITÉ alphabet (1000 codes)', count(distinct c), min(length(c)), max(length(c)), bool_and(c ~ '^[2-9A-HJKMNP-Z]{6}$') from (select gen_delivery_code(6) c from generate_series(1,1000)) x;
-- ===== messagerie
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select send_customer_message('Bonjour, avez-vous encore du piment ?', 'availability', (select id from products where sku='LEG-TOM-001')) \g /dev/null
select send_customer_message('Pouvez-vous me trouver du manioc frais ?', 'special_request') \g /dev/null
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select 'BADGE messages non lus', staff_badges()->>'unread_messages';
select staff_send_message('33333333-3333-3333-3333-333333333333','Oui, arrivage demain matin !') \g /dev/null
select 'BADGE après réponse', staff_badges()->>'unread_messages';
select 'ANNONCE envoyée à', publish_announcement('Promo tomates', 'Bonne tomate pour le saka-saka : -20 % ce week-end !', (select id from products where sku='LEG-TOM-001'), 'marketing', 3);
select 'INFO service envoyée à', publish_announcement('Fermeture', 'Pas de livraison le 25 décembre.', null, 'all', 10);
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false) \g /dev/null
select 'AUTRE client voit messages de Mabiala', count(*) from messages;
select 'AUTRE client notifs', string_agg(subject, ' | ') from notifications where user_id = auth.uid();
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
do $$ begin perform publish_announcement('x','yyyy'); raise notice 'ÉCHEC'; exception when others then raise notice 'livreur ne publie pas : %', sqlerrm; end $$;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select 'CLIENTE fil', string_agg(case when from_staff then 'BB: ' else 'Moi: ' end || body, ' / ' order by id) from messages;
-- verrouillage après 5 erreurs + message « code requis »
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='LEG-TOM-001'),'quantity',2)),
  'fulfillment','delivery','street','Rue A','city','Pointe-Noire','postal_code','Lumumba','slot_id',(select id from available_slots('delivery','Lumumba') limit 1),
  'payment_method','cash_on_delivery','accept_terms',true,'guest_name','Mme Mabiala','guest_phone','06 111 22 33'))->>'id' as o2 \gset
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
select courier_claim(:'o2') \g /dev/null
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select set_order_status(:'o2','preparing') \g /dev/null
select set_order_status(:'o2','ready') \g /dev/null
select set_order_status(:'o2','out_for_delivery') \g /dev/null
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
\set ON_ERROR_STOP off
select set_order_status(:'o2','delivered',null,null,'X');
\set ON_ERROR_STOP on
select 'ESSAI', n, courier_confirm_delivery(:'o2','ZZZZZZ') from generate_series(1,6) n;
reset role;
select 'ALERTE équipe', message from alerts where order_id=:'o2';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
\set ON_ERROR_STOP off
select set_order_status(:'o2','delivered',null,null,'Mme Mabiala');
\set ON_ERROR_STOP on
select set_order_status(:'o2','delivered','Cliente vérifiée par appel vidéo avec sa pièce d''identité',null,'Mme Mabiala (en personne)') \g /dev/null
reset role;
select 'ADMIN sans code', note from order_status_history where order_id=:'o2' and to_status='delivered';
