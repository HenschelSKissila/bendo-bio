-- =====================================================================
-- BENDO BIO — Mise à jour 013 : rayon BOISSONS NATURELLES
--  Bissap (jus d'hibiscus), tangawisi (jus de gingembre), yaourts. Produits frais : DLC suivie par lot.
--  ⚠️ Prix INDICATIFS (FCFA) à ajuster dans Gestion > Produits. Photos : à ajouter dans la fiche produit.
-- À exécuter UNE fois dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- =====================================================================

insert into categories (name, slug, icon, sort_order, expiry_alert_days) values
  ('Boissons naturelles', 'boissons', '🥤', 5, 2)
on conflict (slug) do nothing;

insert into products (sku, name, description, category_id, unit, packaging, price, tax_rate, variable_weight, min_qty, qty_step,
                      ingredients, allergens, conservation, origin, featured, low_threshold, critical_threshold, organic)
select v.sku, v.name, v.descr, c.id, 'piece'::sale_unit, v.pack, v.price, 0, false, 1, 1, v.ingr, v.allerg, v.cons, 'Fabrication artisanale BENDO BIO, Pointe-Noire', v.feat, v.low, v.crit, true
from (values
  ('BOI-BIS-100','Bissap — jus d''hibiscus','Boisson rafraîchissante aux fleurs d''hibiscus (oseille de Guinée), légèrement sucrée et mentholée. Servir bien frais.',
   'bouteille 1 L', 1500, 'Fleurs d''hibiscus, eau, sucre de canne, menthe fraîche', 'Aucun', 'Réfrigérateur 0–4 °C. Après ouverture : 3 jours.', true, 10, 4),
  ('BOI-BIS-050','Bissap — petite bouteille','Le bissap BENDO BIO en format individuel.',
   'bouteille 50 cl', 800, 'Fleurs d''hibiscus, eau, sucre de canne, menthe fraîche', 'Aucun', 'Réfrigérateur 0–4 °C. Après ouverture : 2 jours.', false, 15, 5),
  ('BOI-TAN-100','Tangawisi — jus de gingembre','Jus de gingembre frais pressé, puissant et tonique, adouci au sucre de canne et relevé de citron.',
   'bouteille 1 L', 1500, 'Gingembre frais, eau, sucre de canne, citron', 'Aucun', 'Réfrigérateur 0–4 °C. Après ouverture : 3 jours.', true, 10, 4),
  ('BOI-TAN-050','Tangawisi — petite bouteille','Le tangawisi BENDO BIO en format individuel.',
   'bouteille 50 cl', 800, 'Gingembre frais, eau, sucre de canne, citron', 'Aucun', 'Réfrigérateur 0–4 °C. Après ouverture : 2 jours.', false, 15, 5),
  ('BOI-YAO-001','Yaourt nature','Yaourt ferme au lait entier, onctueux, sans additif.',
   'pot 500 g', 1500, 'Lait entier, ferments lactiques', 'Lait', 'Réfrigérateur 0–4 °C, jusqu''à la date limite (DLC).', true, 8, 3),
  ('BOI-YAB-001','Yaourt à boire','Yaourt à boire nature légèrement sucré.',
   'bouteille 50 cl', 1000, 'Lait entier, sucre de canne, ferments lactiques', 'Lait', 'Réfrigérateur 0–4 °C, jusqu''à la date limite (DLC).', false, 8, 3)
) as v(sku,name,descr,pack,price,ingr,allerg,cons,feat,low,crit)
join categories c on c.slug = 'boissons'
on conflict (sku) do nothing;

notify pgrst, 'reload schema';
