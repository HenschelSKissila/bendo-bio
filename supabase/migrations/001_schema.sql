-- =====================================================================
-- BENDO BIO — Schéma de base de données v1
-- À exécuter dans Supabase > SQL Editor (dans l'ordre : 001, 002, 003, 004)
-- Toutes les règles critiques (stock, prix, capacité, statuts) sont
-- exécutées côté serveur dans des fonctions PostgreSQL (cahier §10.2).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('client','employee','admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type product_status as enum ('active','hidden','unavailable');
exception when duplicate_object then null; end $$;
do $$ begin
  create type sale_unit as enum ('piece','kg','g','l','botte','barquette','sachet','pack','colis');
exception when duplicate_object then null; end $$;
do $$ begin
  create type lot_status as enum ('active','blocked','expired','depleted');
exception when duplicate_object then null; end $$;
do $$ begin
  create type movement_type as enum (
    'reception','sale','return_restock','adjustment','inventory',
    'loss','breakage','donation','destruction','correction');
exception when duplicate_object then null; end $$;
do $$ begin
  create type order_status as enum (
    'pending_payment','confirmed','preparing','ready','out_for_delivery',
    'delivered','cancelled','refunded','partially_refunded','delivery_failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type fulfillment_type as enum ('delivery','pickup');
exception when duplicate_object then null; end $$;
do $$ begin
  create type payment_method as enum ('cash_on_delivery','mobile_money_on_delivery','online');
exception when duplicate_object then null; end $$;
do $$ begin
  create type slot_status as enum ('open','blocked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type alert_level as enum ('info','warning','critical');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Paramètres de l'activité (une seule ligne, id = 1)
-- ---------------------------------------------------------------------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  shop_name text not null default 'BENDO BIO',
  currency text not null default 'EUR',
  timezone text not null default 'Europe/Paris',
  reservation_minutes int not null default 15 check (reservation_minutes between 5 and 120),
  min_prep_hours int not null default 2 check (min_prep_hours >= 0),
  same_day_cutoff time not null default '12:00',
  allow_guest_checkout boolean not null default true,
  allow_pickup boolean not null default true,
  pickup_address text default 'Adresse du point de retrait à renseigner',
  default_expiry_alert_days int not null default 3,
  contact_email text default 'contact@bendobio.example',
  contact_phone text default '+00 000 000 000',
  legal_notice text default 'Mentions légales à compléter par BENDO BIO.',
  privacy_policy text default 'Politique de confidentialité à compléter par BENDO BIO.',
  terms text default 'Conditions générales de vente à compléter par BENDO BIO.',
  delivery_info text default 'Livraison sur créneau dans nos zones desservies. Retrait gratuit au point de vente.',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- Utilisateurs (profil lié à auth.users)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role user_role not null default 'client',
  active boolean not null default true,
  marketing_consent boolean not null default false,
  sms_consent boolean not null default false,
  internal_notes text,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text default 'Domicile',
  street text not null,
  city text not null,
  postal_code text not null,
  instructions text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text default '🥬',
  sort_order int not null default 0,
  expiry_alert_days int,           -- délai d'alerte DLC spécifique à la catégorie
  active boolean not null default true
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text unique,              -- EAN/GTIN pour les produits préemballés (optionnel)
  name text not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  image_url text,
  unit sale_unit not null default 'piece',
  packaging text,                   -- conditionnement / variante (ex. "barquette 500 g", "calibre 2")
  price numeric(12,2) not null check (price >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0),
  variable_weight boolean not null default false, -- poids variable : poids réel saisi à la préparation
  min_qty numeric(12,3) not null default 1 check (min_qty > 0),
  qty_step numeric(12,3) not null default 1 check (qty_step > 0),
  ingredients text,
  allergens text,
  conservation text,
  origin text,
  organic boolean not null default true,
  featured boolean not null default false,
  status product_status not null default 'active',
  low_threshold numeric(12,3) not null default 10,
  critical_threshold numeric(12,3) not null default 3,
  expiry_alert_days int,            -- surcharge du délai d'alerte DLC pour ce produit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on products(category_id);

-- ---------------------------------------------------------------------
-- Stock par lots (FEFO)
-- ---------------------------------------------------------------------
create table if not exists lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  lot_number text not null,
  supplier text,
  received_at date not null default current_date,
  qty_initial numeric(12,3) not null check (qty_initial >= 0),
  qty_remaining numeric(12,3) not null check (qty_remaining >= 0),  -- jamais négatif
  expiry_date date,
  expiry_kind text check (expiry_kind in ('DLC','DDM')),
  unit_cost numeric(12,2),
  status lot_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  unique (product_id, lot_number)
);
create index if not exists lots_product_idx on lots(product_id);
create index if not exists lots_expiry_idx on lots(expiry_date);

-- Journal immuable des mouvements (STK-08)
create table if not exists stock_movements (
  id bigint generated always as identity primary key,
  lot_id uuid references lots(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  type movement_type not null,
  quantity numeric(12,3) not null,  -- signé : + entrée, - sortie
  reason text,
  order_id uuid,
  user_id uuid,                     -- pas de clé étrangère : le journal reste intact si un compte est supprimé
  created_at timestamptz not null default now()
);
create index if not exists movements_product_idx on stock_movements(product_id, created_at desc);
create index if not exists movements_lot_idx on stock_movements(lot_id);

-- ---------------------------------------------------------------------
-- Zones de livraison et créneaux
-- ---------------------------------------------------------------------
create table if not exists delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  postal_codes text[] not null default '{}',
  fee numeric(12,2) not null default 0,
  min_order numeric(12,2) not null default 0,
  free_above numeric(12,2),
  active boolean not null default true
);

-- Modèle hebdomadaire (ex. mardi 9h-12h livraison, capacité 6)
create table if not exists slot_templates (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 1 and 7),  -- 1 = lundi (ISO)
  start_time time not null,
  end_time time not null check (end_time > start_time),
  type fulfillment_type not null,
  zone_id uuid references delivery_zones(id) on delete cascade,
  capacity int not null default 5 check (capacity > 0),
  active boolean not null default true
);

create table if not exists slots (
  id uuid primary key default gen_random_uuid(),
  type fulfillment_type not null,
  zone_id uuid references delivery_zones(id) on delete cascade,  -- null = toutes zones
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  capacity int not null check (capacity >= 0),
  status slot_status not null default 'open',
  note text,
  unique nulls not distinct (type, zone_id, starts_at)
);
create index if not exists slots_start_idx on slots(starts_at);

create table if not exists closed_days (
  day date primary key,
  reason text
);

-- ---------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,     -- non prédictible
  customer_id uuid references profiles(id) on delete set null,
  guest_name text,
  guest_email text,
  guest_phone text,
  status order_status not null default 'pending_payment',
  fulfillment fulfillment_type not null,
  address_street text,
  address_city text,
  address_postal_code text,
  address_instructions text,
  zone_id uuid references delivery_zones(id),
  slot_id uuid references slots(id),
  payment_method payment_method not null,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded','partially_refunded')),
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  customer_note text,
  internal_note text,
  reserved_until timestamptz,             -- réservation temporaire (paiement en ligne)
  stock_committed boolean not null default false, -- true = stock déstocké (FEFO)
  assigned_to uuid references profiles(id),
  departed_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  cancel_reason text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_customer_idx on orders(customer_id);
create index if not exists orders_slot_idx on orders(slot_id);
create index if not exists orders_created_idx on orders(created_at desc);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  -- instantané au moment de l'achat (§7.1)
  product_name text not null,
  product_sku text not null,
  unit sale_unit not null,
  unit_price numeric(12,2) not null,
  tax_rate numeric(5,2) not null default 0,
  quantity numeric(12,3) not null check (quantity > 0),
  actual_weight numeric(12,3),          -- poids réel si poids variable
  line_total numeric(12,2) not null,
  picked boolean not null default false,
  unavailable boolean not null default false
);
create index if not exists order_items_order_idx on order_items(order_id);

-- Traçabilité lot <-> commande (§11.3)
create table if not exists order_item_lots (
  id bigint generated always as identity primary key,
  order_item_id uuid not null references order_items(id) on delete cascade,
  lot_id uuid not null references lots(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0)
);
create index if not exists oil_lot_idx on order_item_lots(lot_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  provider text not null default 'manual',
  external_ref text,
  amount numeric(12,2) not null,
  currency text not null default 'EUR',
  status text not null check (status in ('pending','succeeded','failed','refunded')),
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (provider, external_ref)       -- idempotence webhook (T06)
);

create table if not exists order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  note text,
  user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Alertes, notifications, audit, RGPD
-- ---------------------------------------------------------------------
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('low_stock','critical_stock','expiry_soon','expired_lot','reservation_expired','payment_failed','slot_full','order_late','notification_failed')),
  level alert_level not null,
  product_id uuid references products(id) on delete cascade,
  lot_id uuid references lots(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,
  message text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  resolution_note text,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
-- anti-spam : une seule alerte ouverte par (type, produit, lot, commande) — §8.1
create unique index if not exists alerts_open_unique on alerts (
  type, coalesce(product_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(lot_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(order_id,'00000000-0000-0000-0000-000000000000'::uuid)
) where status = 'open';

create table if not exists notifications (
  id bigint generated always as identity primary key,
  event text not null,
  recipient text,             -- e-mail / téléphone / 'staff'
  channel text not null default 'email' check (channel in ('email','sms','whatsapp','dashboard')),
  order_id uuid references orders(id) on delete cascade,
  subject text,
  body text,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notifications_status_idx on notifications(status, created_at);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on audit_log(created_at desc);

create table if not exists data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  email text not null,
  kind text not null check (kind in ('access','rectification','erasure','opposition')),
  message text,
  status text not null default 'open' check (status in ('open','in_progress','done','rejected')),
  handled_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- Historique des tâches automatiques (vérifiable dans Paramètres)
create table if not exists job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  details jsonb,
  ran_at timestamptz not null default now()
);
