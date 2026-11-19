\set QUIET on
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','admin@x.com') on conflict do nothing;
update profiles set role='admin' where email='admin@x.com';
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select '1. rien configuré', push_health()->>'verdict';
reset role; insert into app_secrets values ('push_function_url','https://x/functions/v1/send-push'),('push_webhook_secret','s') on conflict do nothing;
insert into net._http_response(status_code, content) values (401, '{"code":401,"message":"Missing authorization header"}');
set role authenticated; select '2. Verify JWT activé', push_health()->>'verdict';
reset role; insert into net._http_response(status_code, content) values (401, 'Non autorisé');
set role authenticated; select '3. secret différent', push_health()->>'verdict';
reset role; insert into net._http_response(status_code, content) values (404, 'Function not found');
set role authenticated; select '4. fonction absente', push_health()->>'verdict';
reset role; insert into net._http_response(status_code, content) values (500, 'Clés VAPID manquantes');
set role authenticated; select '5. clés VAPID', push_health()->>'verdict';
reset role; insert into net._http_response(status_code, content) values (200, '{"sent":0,"removed":0}');
set role authenticated; select '6. aucun téléphone', push_health()->>'verdict';
reset role; insert into net._http_response(status_code, content) values (200, '{"sent":2,"removed":0}'),(200, '{"sent":1,"removed":0}');
set role authenticated; select '7. tout va bien', push_health()->>'verdict', push_health()->>'level';
