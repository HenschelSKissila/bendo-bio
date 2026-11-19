-- Parcours complet avec notifications client (base locale uniquement)
\set QUIET on
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com','{"full_name":"Admin"}'),
 ('33333333-3333-3333-3333-333333333333','maman@x.com','{"full_name":"Mme Mavoungou","phone":"06 555 44 33"}') on conflict do nothing;
update profiles set role='admin' where email='admin@x.com';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select receive_stock((select id from products where sku='LEG-TOM-001'), 30, 'T-1', current_date+5) \g /dev/null
-- la cliente commande (livraison Lumumba, paiement à la remise)
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select place_order(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',(select id from products where sku='LEG-TOM-001'),'quantity',3)),
  'fulfillment','delivery','street','Av. Charles de Gaulle','city','Pointe-Noire','postal_code','Lumumba',
  'slot_id',(select id from available_slots('delivery','Lumumba') limit 1),'payment_method','mobile_money_on_delivery','accept_terms',true,'guest_name','Mme Mavoungou','guest_phone','06 555 44 33'))->>'id' as oid \gset
-- l'équipe fait avancer la commande
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select set_order_status(:'oid','preparing') \g /dev/null
select confirm_payment(:'oid','mobile_money','MOMO-778899', null) \g /dev/null
select set_order_status(:'oid','out_for_delivery') \g /dev/null
select notify_order_event(:'oid','nearby') \g /dev/null
select set_order_status(:'oid','delivered', null, null, 'Adèle (sa fille)') \g /dev/null
-- ce que voit la cliente dans son compte
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) \g /dev/null
select 'NOTIF', subject, '→', body from notifications where channel='app' order by id;
select 'NON LUES', count(*) from notifications where read_at is null;
select mark_notifications_read() \g /dev/null
select 'NON LUES après lecture', count(*) from notifications where read_at is null;
select 'LIVRAISON', received_by, delivered_at is not null from orders where id=:'oid';
-- une autre cliente ne voit rien
select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999',false) \g /dev/null
select 'AUTRE CLIENT voit', count(*) from notifications;
-- suivi invité : chronologie
reset role;
select order_number as onum from orders where id=:'oid' \gset
set role anon;
select set_config('request.jwt.claims','{"role":"anon"}',false) \g /dev/null
select 'SUIVI', t->>'received_by', jsonb_array_length(t->'history') from (select track_order(:'onum','06 555 44 33') t) x;
-- visiteur ne peut pas notifier
do $$ begin perform notify_order_event((select id from orders limit 1),'nearby'); raise notice 'ÉCHEC'; exception when others then raise notice 'anon bloqué : %', sqlerrm; end $$;
-- push : configuration puis vérification des appels à la fonction d'envoi
reset role;
insert into app_secrets values ('push_function_url','https://exemple.supabase.co/functions/v1/send-push'),('push_webhook_secret','test') on conflict do nothing;
set role anon;
select set_config('request.jwt.claims','{"role":"anon"}',false) \g /dev/null
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'PUSH invité abonné', save_push_subscription('https://push.example/abc','p256','auth', :'onum', '06 555 44 33');
do $$ begin perform save_push_subscription('https://push.example/zzz','p','a', 'BB-FAUX', '0600000000'); raise notice 'ÉCHEC'; exception when others then raise notice 'PUSH mauvais contact refusé : %', sqlerrm; end $$;
do $$ begin perform * from app_secrets; raise notice 'ÉCHEC secrets lisibles'; exception when others then raise notice 'secrets protégés : %', sqlerrm; end $$;
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
set role authenticated;
select notify_order_event(:'oid','message','Votre facture est disponible au magasin.') \g /dev/null
reset role;
select 'PUSH appel', body->'record'->>'channel', body->'record'->>'subject', headers->>'x-bendo-secret' from net.calls order by id desc limit 2;
