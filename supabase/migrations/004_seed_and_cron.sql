-- =====================================================================
-- BENDO BIO — Données de démarrage (modifiables ensuite dans l'admin)
-- + tâches automatiques (pg_cron)
-- =====================================================================

insert into categories (name, slug, icon, sort_order, expiry_alert_days) values
  ('Légumes', 'legumes', '🥕', 1, 2),
  ('Fruits', 'fruits', '🍎', 2, 2),
  ('Herbes & aromates', 'herbes', '🌿', 3, 1),
  ('Produits laitiers & œufs', 'laitiers', '🥚', 4, 3),
  ('Épicerie fraîche', 'epicerie', '🧺', 5, 5)
on conflict (slug) do nothing;

insert into products (sku, name, description, category_id, unit, packaging, price, tax_rate, variable_weight, min_qty, qty_step,
                      conservation, origin, featured, low_threshold, critical_threshold, allergens)
select v.sku, v.name, v.descr, c.id, v.unit::sale_unit, v.pack, v.price, 5.5, v.varw, v.minq, v.step, v.cons, v.origin, v.feat, v.low, v.crit, v.allerg
from (values
  ('LEG-TOM-001','Tomates rondes bio','Tomates mûries au soleil, idéales en salade.','legumes','kg',null,3.90,true,0.5,0.5,'Température ambiante, à l''abri du soleil','Production locale',true,10,4,'Aucun'),
  ('LEG-OIG-001','Oignons jaunes bio','Oignons de conservation, goût doux.','legumes','kg',null,2.20,true,0.5,0.5,'Endroit sec et aéré','Production locale',true,15,5,'Aucun'),
  ('LEG-CAR-001','Carottes bio','Carottes croquantes et sucrées.','legumes','botte','botte ~1 kg',2.50,false,1,1,'Réfrigérateur, bac à légumes','Production locale',true,8,3,'Aucun'),
  ('LEG-AUB-001','Aubergines bio','Aubergines fermes et brillantes.','legumes','piece',null,1.20,false,1,1,'Réfrigérateur, 5 jours max','Production locale',false,10,4,'Aucun'),
  ('LEG-BRO-001','Brocoli bio','Brocoli vert, riche en saveur.','legumes','piece','tête ~400 g',2.10,false,1,1,'Réfrigérateur, 3 jours','Production locale',false,6,2,'Aucun'),
  ('LEG-AIL-001','Ail bio','Têtes d''ail violet.','legumes','sachet','sachet 250 g',2.80,false,1,1,'Endroit sec','Production locale',false,6,2,'Aucun'),
  ('FRU-POM-001','Pommes bio','Pommes croquantes de saison.','fruits','kg',null,3.20,true,1,0.5,'Endroit frais','Verger partenaire',true,10,4,'Aucun'),
  ('HER-PER-001','Persil plat bio','Botte de persil frais.','herbes','botte',null,1.10,false,1,1,'Réfrigérateur, tiges dans l''eau','Production locale',false,5,2,'Aucun'),
  ('LAI-OEU-001','Œufs bio x6','Œufs de poules élevées en plein air.','laitiers','pack','boîte de 6',2.90,false,1,1,'Réfrigérateur','Ferme partenaire',true,6,2,'Œufs')
) as v(sku,name,descr,cat,unit,pack,price,varw,minq,step,cons,origin,feat,low,crit,allerg)
join categories c on c.slug = v.cat
on conflict (sku) do nothing;

insert into delivery_zones (name, postal_codes, fee, min_order, free_above)
select 'Zone centre (exemple)', array['75001','75002','75003','75004'], 3.50, 15, 60
where not exists (select 1 from delivery_zones);

-- Modèle de créneaux : livraison mar–sam 9h-12h et 16h-19h ; retrait mer et sam 10h-13h
insert into slot_templates (weekday, start_time, end_time, type, capacity)
select d, s::time, e::time, 'delivery', 6
from generate_series(2,6) d, (values ('09:00','12:00'),('16:00','19:00')) t(s,e)
where not exists (select 1 from slot_templates);
insert into slot_templates (weekday, start_time, end_time, type, capacity)
select d, '10:00', '13:00', 'pickup', 10 from unnest(array[3,6]) d
where not exists (select 1 from slot_templates where type = 'pickup');

select generate_slots(14);

-- ---------------------------------------------------------------------
-- Tâches automatiques (si l'extension pg_cron est activée :
-- Supabase > Database > Extensions > pg_cron). Sinon, les tâches sont
-- lancées automatiquement à l'ouverture du tableau de bord.
-- ---------------------------------------------------------------------
do $$ begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron non disponible : tâches lancées depuis le tableau de bord';
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname in ('bendo-maintenance','bendo-reservations');
  perform cron.schedule('bendo-reservations', '*/5 * * * *', 'select public.release_expired_reservations()');
  perform cron.schedule('bendo-maintenance', '15 * * * *', 'select public._run_jobs()');
end $$;
