\set QUIET on
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','admin@x.com'),('22222222-2222-2222-2222-222222222222','emp@x.com') on conflict do nothing;
update profiles set role='admin' where email='admin@x.com'; update profiles set role='employee' where email='emp@x.com';
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \g /dev/null
do $$ begin perform delete_product((select id from products where sku='LEG-CHO-001')); raise notice 'ÉCHEC'; exception when others then raise notice 'gestionnaire refusé : %', sqlerrm; end $$;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select receive_stock((select id from products where sku='LEG-TOM-001'), 5, 'T-9', current_date+3) \g /dev/null
select 'JAMAIS UTILISÉ', delete_product((select id from products where sku='LEG-CHO-001'));
select 'AVEC HISTORIQUE', delete_product((select id from products where sku='LEG-TOM-001'));
reset role;
select 'chou en base ?', count(*) from products where sku='LEG-CHO-001';
select 'tomates', status, archived_at is not null as archivee, (select count(*) from lots l where l.product_id=p.id) as lots_conserves from products p where sku='LEG-TOM-001';
set role anon; select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'visible en boutique ?', count(*) from products where sku='LEG-TOM-001';
reset role; set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
select restore_product((select id from products where sku='LEG-TOM-001')) \g /dev/null
select 'restaurée', status, archived_at from products where sku='LEG-TOM-001';
do $$ begin perform delete_category((select id from categories where slug='legumes')); raise notice 'ÉCHEC'; exception when others then raise notice 'rayon non vide : %', sqlerrm; end $$;
select delete_category((select id from categories where slug='epicerie')) \g /dev/null
select 'rayon vide supprimé', count(*) = 0 from categories where slug='epicerie';
reset role; select 'journal d''audit (suppression)', count(*) from audit_log where entity='products' and action='delete';
