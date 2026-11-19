-- =====================================================================
-- BENDO BIO — Mise à jour 015 : notifications complètes pour l'équipe + test de notification
--  · L'équipe (admin / gestionnaires) est prévenue sur son téléphone quand :
--    une livraison est prise par un livreur, partie, livrée, en échec ; un paiement est reçu ;
--    une commande payée en ligne est confirmée.
--  · Bouton « Tester les notifications » : envoie une notification à son propre téléphone.
-- À exécuter UNE fois après 014, dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- =====================================================================

create or replace function orders_staff_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_courier text; v_title text; v_body text;
begin
  select full_name into v_courier from profiles where id = new.courier_id;
  -- commande payée en ligne puis confirmée (les paiements à la remise sont déjà signalés à la création)
  if tg_op = 'UPDATE' and old.status = 'pending_payment' and new.status = 'confirmed' and new.payment_method = 'online' then
    v_title := '🛒 Nouvelle commande ' || new.order_number;
    v_body := 'Commande payée en ligne : ' || trim_scale(new.total) || ' ' || new.currency || '.';
  -- un livreur prend la livraison
  elsif tg_op = 'UPDATE' and new.courier_id is not null and old.courier_id is distinct from new.courier_id then
    v_title := '🛵 Livraison prise : ' || new.order_number;
    v_body := coalesce(v_courier, 'Un livreur') || ' livre ' || coalesce(new.address_postal_code, '') || '.';
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('out_for_delivery','delivered','delivery_failed') and new.fulfillment = 'delivery' then
    v_title := case new.status when 'out_for_delivery' then '🚚 En route : ' when 'delivered' then '✅ Livrée : ' else '⚠️ Échec de livraison : ' end || new.order_number;
    v_body := coalesce(v_courier, 'Livreur') || case new.status
      when 'out_for_delivery' then ' est parti vers ' || coalesce(new.address_postal_code, 'le client') || '.'
      when 'delivered' then ' a livré' || coalesce(' — remise à ' || new.received_by, '') || '.'
      else ' : ' || coalesce(new.failure_reason, 'motif non précisé') || '.' end;
  elsif tg_op = 'UPDATE' and new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    v_title := '💶 Paiement reçu : ' || new.order_number;
    v_body := trim_scale(new.total) || ' ' || new.currency || coalesce(' encaissés par ' || v_courier, '') || '.';
  end if;
  if v_title is not null then
    insert into notifications(event, recipient, channel, order_id, subject, body, status, sent_at)
    values ('staff_order_update', 'staff', 'dashboard', new.id, v_title, v_body, 'sent', now());
  end if;
  return new;
end $$;
drop trigger if exists orders_staff_notify on orders;
create trigger orders_staff_notify after update of status, courier_id, payment_status on orders
  for each row execute function orders_staff_notify();

-- Notification de test vers ses propres appareils (tous rôles connectés)
create or replace function send_test_notification() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: connectez-vous'; end if;
  insert into notifications(event, recipient, channel, subject, body, status, sent_at, user_id)
  values ('test', null, 'app', '🔔 Test BENDO BIO', 'Bravo ! Les notifications fonctionnent sur cet appareil (' || to_char(now() at time zone shop_tz(), 'HH24:MI:SS') || ').', 'sent', now(), auth.uid());
end $$;

revoke execute on function orders_staff_notify() from public, anon, authenticated;
revoke execute on function send_test_notification() from public, anon;
grant execute on function send_test_notification() to authenticated;
notify pgrst, 'reload schema';
