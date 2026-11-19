\set QUIET on
insert into auth.users(id,email,raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111','admin@x.com','{"full_name":"Admin"}');
update profiles set role='admin';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select 'AVANT', staff_badges() - 'since';
reset role;
insert into auth.users(id,email,raw_user_meta_data) values ('22222222-2222-2222-2222-222222222222','c1@x.com','{"full_name":"Client Un"}'),
  ('33333333-3333-3333-3333-333333333333','l1@x.com','{"full_name":"Livreur","requested_role":"courier"}');
select 'NOTIF équipe', subject, body from notifications where event in ('new_customer','role_request');
set role authenticated;
select 'APRÈS inscriptions', staff_badges()->>'new_customers', staff_badges()->>'role_requests';
select mark_section_seen('customers') \g /dev/null
select 'APRÈS visite Clients', staff_badges()->>'new_customers';
reset role; set role anon;
do $$ begin perform staff_badges(); raise notice 'ÉCHEC'; exception when others then raise notice 'visiteur bloqué : %', sqlerrm; end $$;
