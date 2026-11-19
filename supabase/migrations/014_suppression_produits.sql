-- =====================================================================
-- BENDO BIO — Mise à jour 014 : suppression des produits et des rayons (administrateur)
--  · Produit jamais utilisé (aucun stock, aucune vente) → supprimé définitivement.
--  · Produit avec historique (lots, mouvements, commandes) → ARCHIVÉ : retiré de la boutique et des
--    listes, historique et traçabilité conservés (obligation de traçabilité des lots), restaurable.
--  · Rayon vide → supprimé ; rayon contenant des produits actifs → refusé avec explication.
-- À exécuter UNE fois dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- =====================================================================

alter table products add column if not exists archived_at timestamptz;

create or replace function delete_product(p_product uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p products; v_stock numeric;
begin
  perform require_admin();
  select * into p from products where id = p_product for update;
  if not found then raise exception 'NOT_FOUND: produit introuvable'; end if;
  -- jamais utilisé : suppression définitive
  if not exists (select 1 from lots where product_id = p_product)
     and not exists (select 1 from stock_movements where product_id = p_product)
     and not exists (select 1 from order_items where product_id = p_product) then
    delete from alerts where product_id = p_product;
    delete from products where id = p_product;
    return jsonb_build_object('result', 'deleted', 'name', p.name);
  end if;
  -- historique : archivage (retiré de la vente et des listes, traçabilité conservée)
  select coalesce(sum(qty_remaining), 0) into v_stock from lots where product_id = p_product and status in ('active','blocked');
  update products set status = 'hidden', featured = false, archived_at = now() where id = p_product;
  update alerts set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution_note = 'Produit supprimé (archivé)'
  where product_id = p_product and status = 'open';
  return jsonb_build_object('result', 'archived', 'name', p.name, 'stock_left', v_stock);
end $$;

create or replace function restore_product(p_product uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  update products set archived_at = null, status = 'active' where id = p_product and archived_at is not null;
end $$;

create or replace function delete_category(p_category uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform require_admin();
  select count(*) into n from products where category_id = p_category and archived_at is null;
  if n > 0 then
    raise exception 'CATEGORY_NOT_EMPTY: ce rayon contient encore % produit(s) : déplacez-les vers un autre rayon ou supprimez-les d''abord', n;
  end if;
  update products set category_id = null where category_id = p_category;   -- produits archivés : conservés sans rayon
  delete from categories where id = p_category;
end $$;

revoke execute on function delete_product(uuid) from public, anon;
revoke execute on function restore_product(uuid) from public, anon;
revoke execute on function delete_category(uuid) from public, anon;
grant execute on function delete_product(uuid) to authenticated;
grant execute on function restore_product(uuid) to authenticated;
grant execute on function delete_category(uuid) to authenticated;
notify pgrst, 'reload schema';
