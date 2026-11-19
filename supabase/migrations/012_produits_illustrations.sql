-- =====================================================================
-- BENDO BIO — Mise à jour 012 : nouveaux légumes / fruits + illustrations de tous les produits et rayons
--  · Ajoute : haricots verts, chou, poivrons verts, poivrons rouges, piment fort, pommes de terre,
--    citrons verts, concombres (prix INDICATIFS en FCFA, à ajuster dans Gestion > Produits).
--  · Illustrations (fichiers /produits/*.svg et /rayons/*.svg publiés avec le site) pour tous les produits
--    et rayons qui n'ont pas encore de photo. Une photo ajoutée plus tard dans la gestion les remplace.
-- À exécuter UNE fois après 011, dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- =====================================================================

alter table categories add column if not exists image_url text;

insert into products (sku, name, description, category_id, unit, packaging, price, tax_rate, variable_weight, min_qty, qty_step,
                      conservation, origin, featured, low_threshold, critical_threshold, allergens, organic)
select v.sku, v.name, v.descr, c.id, v.unit::sale_unit, v.pack, v.price, 0, v.varw, v.minq, v.step, v.cons, 'Production locale', v.feat, v.low, v.crit, 'Aucun', true
from (values
  ('LEG-HAR-001','Haricots verts bio','Haricots verts fins et croquants, récoltés à la main.','legumes','kg',null,1500,true,0.5,0.5,'Réfrigérateur, 3 à 4 jours',true,8,3),
  ('LEG-CHO-001','Chou vert bio','Chou pommé bien serré, pour les salades, le chou braisé ou les sauces.','legumes','piece','pièce ~1 kg',1000,false,1,1,'Endroit frais, 1 semaine',false,6,2),
  ('LEG-POV-001','Poivrons verts bio','Poivrons verts charnus, parfaits pour les sauces et les grillades.','legumes','kg',null,2500,true,0.5,0.5,'Réfrigérateur, 5 jours',false,6,2),
  ('LEG-POR-001','Poivrons rouges bio','Poivrons rouges mûrs et sucrés.','legumes','kg',null,3000,true,0.5,0.5,'Réfrigérateur, 5 jours',false,6,2),
  ('LEG-PIM-001','Piment fort bio','Petits piments forts orange et rouges, très parfumés. À utiliser avec modération !','legumes','sachet','sachet 100 g',500,false,1,1,'Réfrigérateur ou au sec, 1 semaine',true,10,4),
  ('LEG-PDT-001','Pommes de terre bio','Pommes de terre à chair ferme, pour frites, ragoûts et purées.','legumes','kg',null,1200,true,1,0.5,'Endroit sec, frais et sombre',true,15,5),
  ('FRU-CIT-001','Citrons verts bio','Citrons verts juteux pour les jus, marinades et sauces.','fruits','sachet','lot de 6',1000,false,1,1,'Température ambiante, 1 semaine',false,10,4),
  ('LEG-CON-001','Concombres bio','Concombres frais et croquants, pour salades et jus.','legumes','piece',null,500,false,1,1,'Réfrigérateur, 5 jours',false,10,4)
) as v(sku,name,descr,cat,unit,pack,price,varw,minq,step,cons,feat,low,crit)
join categories c on c.slug = v.cat
on conflict (sku) do nothing;

-- Illustrations des produits (seulement si aucune photo n'a déjà été ajoutée)
update products p set image_url = '/produits/' || v.img || '.svg'
from (values
  ('LEG-TOM-001','tomates'),('LEG-OIG-001','oignons'),('LEG-CAR-001','carottes'),('LEG-AUB-001','aubergines'),
  ('LEG-BRO-001','brocoli'),('LEG-AIL-001','ail'),('FRU-POM-001','pommes'),('HER-PER-001','persil'),('LAI-OEU-001','oeufs'),
  ('LEG-HAR-001','haricots-verts'),('LEG-CHO-001','chou'),('LEG-POV-001','poivrons-verts'),('LEG-POR-001','poivrons-rouges'),
  ('LEG-PIM-001','piments'),('LEG-PDT-001','pommes-de-terre'),('FRU-CIT-001','citrons-verts'),('LEG-CON-001','concombres'),
  ('VOL-PBV-001','poulet-bicyclette'),('VOL-PBP-001','poulet-pret-a-cuire'),('VOL-BRA-001','poulet-brahma'),('VOL-PCH-001','poulet-chair'),
  ('VOL-CAV-001','canard'),('VOL-CAP-001','canard-pret-a-cuire'),('VOL-CAN-001','caneton'),
  ('VOL-POC-001','poussin-chair'),('VOL-POB-001','poussin-bicyclette'),('VOL-PON-001','pondeuse')
) as v(sku, img)
where p.sku = v.sku and (p.image_url is null or p.image_url = '' or p.image_url like '/produits/%');

-- Illustrations des rayons
update categories c set image_url = '/rayons/' || c.slug || '.svg'
where c.slug in ('legumes','fruits','herbes','laitiers','epicerie','poulets','canards','poussins')
  and (c.image_url is null or c.image_url like '/rayons/%');

notify pgrst, 'reload schema';
