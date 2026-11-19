-- =====================================================================
-- BENDO BIO — Mise à jour 016 : diagnostic précis des notifications push
--  Lit les réponses de la fonction d'envoi (send-push) aux derniers envois (journal pg_net, 6 h)
--  et indique la cause exacte d'un échec : fonction absente, « Verify JWT » activé, secret différent,
--  clés VAPID manquantes, aucun téléphone abonné…  Visible dans Gestion > Paramètres.
-- À exécuter UNE fois dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- =====================================================================

create or replace function push_health() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_conf boolean; v_net boolean; v_resp jsonb := '[]'::jsonb; v_total int := 0; v_ok int := 0; v_sent int := 0;
  v_code int; v_msg text; v_verdict text; v_level text := 'ok'; v_notifs int;
begin
  perform require_staff();
  v_conf := exists (select 1 from app_secrets where key = 'push_function_url') and exists (select 1 from app_secrets where key = 'push_webhook_secret');
  v_net := exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post');
  select count(*) into v_notifs from notifications where channel in ('app','dashboard') and created_at > now() - interval '6 hours';
  if v_net and to_regclass('net._http_response') is not null then
    execute $q$
      select count(*), count(*) filter (where status_code = 200),
             coalesce(sum(case when status_code = 200 and content ~ '"sent"' then (substring(content from '"sent":\s*([0-9]+)'))::int else 0 end), 0)
      from net._http_response where created > now() - interval '6 hours' $q$ into v_total, v_ok, v_sent;
    execute $q$ select status_code, left(coalesce(content, error_msg, ''), 200)
      from net._http_response where created > now() - interval '6 hours' order by id desc limit 1 $q$ into v_code, v_msg;
    execute $q$ select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select status_code, left(coalesce(content, error_msg, ''), 120) as message, count(*) as nb, max(created) as dernier
      from net._http_response where created > now() - interval '6 hours' group by 1, 2 order by max(created) desc limit 5) x $q$ into v_resp;
  end if;

  v_verdict := case
    when not v_net then 'Extension pg_net absente : Supabase > Database > Extensions > activer « pg_net », puis ré-exécuter le script 007.'
    when not v_conf then 'Envoi non relié : faites l''étape C du document de configuration (table app_secrets).'
    when v_total = 0 and v_notifs > 0 then 'Des notifications ont été créées mais aucun envoi n''a été tenté : vérifiez l''URL de la fonction dans app_secrets.'
    when v_total = 0 then 'Aucun envoi depuis 6 h. Utilisez « Tester sur cet appareil » pour vérifier.'
    when v_code = 404 then 'La fonction « send-push » est introuvable : créez-la/déployez-la (étape A) avec exactement ce nom.'
    when v_code = 401 and v_msg ilike '%authorization%' then 'L''option « Verify JWT / Enforce JWT verification » est encore ACTIVÉE sur send-push : désactivez-la (étape A, point 5).'
    when v_code = 401 then 'Secret refusé : PUSH_WEBHOOK_SECRET (étape B) doit être identique à push_webhook_secret (étape C).'
    when v_code = 500 and v_msg ilike '%VAPID%' then 'Clés VAPID manquantes dans les secrets de la fonction (étape B).'
    when v_code >= 400 or v_code is null then 'Erreur de la fonction d''envoi (' || coalesce(v_code::text, 'pas de réponse') || ') : ' || coalesce(v_msg, '')
    when v_sent = 0 then 'La fonction répond, mais aucun téléphone n''était abonné pour ces destinataires : chacun doit toucher « Autoriser les notifications » sur son téléphone.'
    else 'Fonctionnel : ' || v_sent || ' notification(s) remise(s) aux téléphones ces 6 dernières heures.' end;
  v_level := case when v_verdict like 'Fonctionnel%' then 'ok' when v_verdict like 'Aucun envoi%' then 'info' else 'error' end;

  return jsonb_build_object(
    'configured', v_conf, 'pg_net', v_net,
    'devices', (select count(*) from push_subscriptions),
    'staff_devices', (select count(*) from push_subscriptions s join profiles p on p.id = s.user_id where p.role::text in ('employee','admin')),
    'courier_devices', (select count(*) from push_subscriptions s join profiles p on p.id = s.user_id where p.role::text = 'courier'),
    'my_devices', (select count(*) from push_subscriptions where user_id = auth.uid()),
    'attempts_6h', v_total, 'ok_6h', v_ok, 'delivered_6h', v_sent,
    'verdict', v_verdict, 'level', v_level, 'responses', v_resp);
end $$;

revoke execute on function push_health() from public, anon;
grant execute on function push_health() to authenticated;
notify pgrst, 'reload schema';
