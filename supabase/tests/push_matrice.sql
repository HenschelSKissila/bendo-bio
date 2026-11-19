-- Matrice complète : chaque événement → qui est notifié → appel d'envoi push (base locale uniquement)
\set QUIET on
insert into app_secrets values ('push_function_url','https://exemple/functions/v1/send-push'),('push_webhook_secret','s') on conflict do nothing;
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com','{"full_name":"Admin"}'),
 ('22222222-2222-2222-2222-222222222222','gest@x.com','{"full_name":"Gestionnaire"}'),
 ('55555555-5555-5555-5555-555555555555','jean@x.com','{"full_name":"Jean Livreur"}'),
 ('33333333-3333-3333-3333-333333333333','cliente@x.com','{"full_name":"Mme Kaya","phone":"06 777 88 99","marketing_consent":true}');
update profiles set role='admin' where email='admin@x.com'; update profiles set role='employee' where email='gest@x.com'; update profiles set role='courier' where email='jean@x.com';
insert into auth.users(id,email,raw_user_meta_data) values ('66666666-6666-6666-6666-666666666666','nouveau@x.com','{"full_name":"Nouveau client"}');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select receive_stock((select id from products where sku='VOL-PBV-001'), 10, 'P-1', current_date+5) \g /dev/null
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='VOL-PBV-001'),'quantity',1)),
  'fulfillment','delivery','street','Rue B','city','Pointe-Noire','postal_code','Loandjili','slot_id',(select id from available_slots('delivery','Loandjili') limit 1),
  'payment_method','cash_on_delivery','accept_terms',true,'guest_name','Mme Kaya','guest_phone','06 777 88 99'))->>'id' as oid \gset
select send_customer_message('Avez-vous des canards ?','availability',null) \g /dev/null
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
select courier_claim(:'oid') \g /dev/null
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \g /dev/null
select set_order_status(:'oid','preparing') \g /dev/null
select set_order_status(:'oid','ready') \g /dev/null
select staff_send_message('33333333-3333-3333-3333-333333333333','Oui, arrivage demain') \g /dev/null
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
select set_order_status(:'oid','out_for_delivery') \g /dev/null
select notify_order_event(:'oid','nearby') \g /dev/null
reset role; select code as c from delivery_codes where order_id=:'oid' \gset
set role authenticated; select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false) \g /dev/null
select courier_confirm_delivery(:'oid', :'c', 'Mme Kaya (en personne)') \g /dev/null
select confirm_payment(:'oid','especes',null,null) \g /dev/null
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select publish_announcement('Promo poulets','Poulets bicyclette -10 %',null,'marketing',3) \g /dev/null
select send_test_notification() \g /dev/null
reset role;
\echo ---------- QUI REÇOIT QUOI ----------
select rpad(case when n.channel='dashboard' then '👥 ÉQUIPE (admin + gestionnaires)' else coalesce('👤 ' || p.full_name || ' (' || p.role || ')', '👤 invité') end, 40) as destinataire, n.subject
from notifications n left join profiles p on p.id = n.user_id
where n.channel in ('app','dashboard') order by n.id;
\echo ---------- CONTRÔLE ----------
select 'notifications app/dashboard', count(*) from notifications where channel in ('app','dashboard');
select 'appels d''envoi push déclenchés', count(*) from net.calls;
select 'doublons « nouvelle commande »', count(*) from notifications where subject like '%Nouvelle commande%';
