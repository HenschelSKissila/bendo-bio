-- =====================================================================
-- BENDO BIO — Mise à jour 011 : rayons VOLAILLE BIO
--  Poulets bio (bicyclette / traditionnel congolais, Brahma, poulet de chair), canards & canetons,
--  poussins & pondeuses. Vendus à la pièce, vivants ou prêts à cuire.
--  ⚠️ Les prix sont INDICATIFS (FCFA) : ajustez-les dans Gestion > Produits avant l'ouverture.
--  Les produits apparaissent « Indisponible » tant qu'aucune réception de stock n'est saisie.
-- À exécuter UNE fois dans Supabase > SQL Editor. Ré-exécutable sans risque (rien n'est dupliqué).
-- =====================================================================

insert into categories (name, slug, icon, sort_order, expiry_alert_days) values
  ('Poulets bio', 'poulets', '🐔', 2, 1),
  ('Canards & canetons', 'canards', '🦆', 3, 1),
  ('Poussins & pondeuses', 'poussins', '🐣', 4, 1)
on conflict (slug) do nothing;

-- les rayons existants passent après la volaille dans l'ordre d'affichage (sauf Légumes, en tête)
update categories set sort_order = sort_order + 10 where slug in ('fruits','herbes','laitiers','epicerie') and sort_order < 10;

insert into products (sku, name, description, category_id, unit, packaging, price, tax_rate, variable_weight, min_qty, qty_step,
                      conservation, origin, featured, low_threshold, critical_threshold, allergens, organic)
select v.sku, v.name, v.descr, c.id, 'piece'::sale_unit, v.pack, v.price, 0, false, 1, 1, v.cons, 'Élevage partenaire, Congo', v.feat, v.low, v.crit, 'Aucun', true
from (values
  -- Poulets
  ('VOL-PBV-001','Poulet bicyclette (traditionnel congolais) — vivant',
   'Poulet local élevé en plein air, nourri au grain. Chair ferme et goûteuse, idéal pour le poulet à la moambé ou le poulet fumé.',
   'poulets','vivant, ~1,2 à 1,6 kg', 6000, 'Animal vivant : à garder au frais et à l''ombre, avec de l''eau, jusqu''à l''abattage.', true, 5, 2),
  ('VOL-PBP-001','Poulet bicyclette — prêt à cuire',
   'Poulet traditionnel congolais abattu le jour même, plumé et vidé.',
   'poulets','plumé et vidé, ~1 à 1,3 kg', 7000, 'Réfrigérateur 0–4 °C, à consommer sous 2 jours, ou congélateur.', true, 5, 2),
  ('VOL-BRA-001','Poulet Brahma — vivant',
   'Grande race Brahma, élevée sans antibiotiques de croissance. Volaille de prestige pour les fêtes et grandes tablées.',
   'poulets','vivant, ~3 à 4 kg', 20000, 'Animal vivant : à garder au frais et à l''ombre, avec de l''eau.', true, 3, 1),
  ('VOL-PCH-001','Poulet bio de chair — prêt à cuire',
   'Poulet de chair élevé en bio, plumé et vidé.',
   'poulets','plumé et vidé, ~1,5 kg', 5500, 'Réfrigérateur 0–4 °C, à consommer sous 2 jours, ou congélateur.', false, 5, 2),
  -- Canards
  ('VOL-CAV-001','Canard — vivant',
   'Canard élevé en liberté, nourri naturellement.',
   'canards','vivant, ~2 à 3 kg', 12000, 'Animal vivant : à garder au frais et à l''ombre, avec de l''eau.', true, 3, 1),
  ('VOL-CAP-001','Canard — prêt à cuire',
   'Canard abattu le jour même, plumé et vidé.',
   'canards','plumé et vidé, ~1,8 à 2,5 kg', 13500, 'Réfrigérateur 0–4 °C, à consommer sous 2 jours, ou congélateur.', false, 3, 1),
  ('VOL-CAN-001','Caneton',
   'Jeune canard pour démarrer ou agrandir votre élevage.',
   'canards','1 à 3 semaines', 3000, 'Animal vivant : abri chaud, eau propre et aliment démarrage.', false, 5, 2),
  -- Poussins & pondeuses
  ('VOL-POC-001','Poussin chair (1 jour)',
   'Poussin de chair d''un jour, vacciné.',
   'poussins','1 jour, vacciné', 800, 'Animal vivant : chaleur (32–35 °C la 1re semaine), eau et aliment démarrage.', false, 20, 10),
  ('VOL-POB-001','Poussin bicyclette (race locale)',
   'Poussin de race locale congolaise, rustique, pour élevage familial.',
   'poussins','1 à 2 semaines', 1000, 'Animal vivant : abri chaud, eau propre et aliment démarrage.', false, 20, 10),
  ('VOL-PON-001','Poule pondeuse',
   'Poule pondeuse en début de ponte, vaccinée.',
   'poussins','en début de ponte, vaccinée', 5000, 'Animal vivant : poulailler aéré, eau, aliment ponte.', true, 5, 2)
) as v(sku,name,descr,cat,pack,price,cons,feat,low,crit)
join categories c on c.slug = v.cat
on conflict (sku) do nothing;

notify pgrst, 'reload schema';
