// Supabase Edge Function (optionnelle) : envoie les e-mails en attente de la table "notifications".
// Déploiement : supabase functions deploy send-notifications
// Secrets requis : supabase secrets set RESEND_API_KEY=... MAIL_FROM="BENDO BIO <commandes@votre-domaine>"
// Déclenchement : planifier un appel toutes les 2 minutes (Supabase > Edge Functions > Schedules, ou pg_cron + pg_net).
import { createClient } from 'npm:@supabase/supabase-js@2.46.1'

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('MAIL_FROM') ?? 'BENDO BIO <onboarding@resend.dev>'
  if (!key) return new Response('RESEND_API_KEY manquant', { status: 500 })

  const { data: rows } = await db.from('notifications').select('*')
    .eq('status', 'pending').eq('channel', 'email').lt('attempts', 5).order('id').limit(50)
  let sent = 0, failed = 0
  for (const n of rows ?? []) {
    if (!n.recipient || !n.recipient.includes('@')) { await db.from('notifications').update({ status: 'skipped' }).eq('id', n.id); continue }
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: n.recipient, subject: n.subject ?? 'BENDO BIO', text: `${n.body ?? ''}\n\n— L'équipe BENDO BIO` }),
      })
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
      await db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: n.attempts + 1 }).eq('id', n.id)
      sent++
    } catch (e) {
      // échec temporaire : réessai automatique jusqu'à 5 tentatives, puis "failed" (visible dans Paramètres)
      const attempts = n.attempts + 1
      await db.from('notifications').update({ attempts, last_error: String(e).slice(0, 300), status: attempts >= 5 ? 'failed' : 'pending' }).eq('id', n.id)
      failed++
    }
  }
  return Response.json({ sent, failed })
})
