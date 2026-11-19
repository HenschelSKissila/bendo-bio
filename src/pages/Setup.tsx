import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, rpc, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Card, ErrorBox, SuccessBox, Spinner } from '../components/ui'
import ConnectionDot from '../components/ConnectionDot'

/** Première installation : le premier compte qui le demande devient administrateur. */
export default function Setup() {
  const { session, refreshProfile } = useAuth()
  const nav = useNavigate()
  const [exists, setExists] = useState<boolean | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  useEffect(() => { supabase.rpc('admin_exists').then(({ data, error }) => { if (error) setErr(errMsg(error)); else setExists(Boolean(data)) }) }, [])
  async function claim() {
    setErr(null)
    try {
      const r = await rpc<boolean>('claim_first_admin')
      if (!r) { setErr('Un administrateur existe déjà.'); return }
      await refreshProfile(); setOk('Vous êtes maintenant administrateur.'); setTimeout(() => nav('/admin'), 1200)
    } catch (e) { setErr(errMsg(e)) }
  }
  return (
    <div className="mx-auto max-w-lg">
      <Card className="space-y-4">
        <h1 className="text-xl font-bold text-brand-900">Installation de BENDO BIO</h1>
        <ConnectionDot />
        {exists === null && !err ? <Spinner /> : exists ? (
          <p className="text-sm">Un administrateur est déjà configuré. <Link to="/connexion?staff=1" className="text-brand-700 underline">Se connecter</Link></p>
        ) : !session ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li><Link to="/connexion?mode=signup&next=/installation" className="font-semibold text-brand-700 underline">Créez votre compte</Link> (e-mail + mot de passe robuste).</li>
            <li>Confirmez l'e-mail si demandé, puis connectez-vous.</li>
            <li>Revenez sur cette page et cliquez « Devenir administrateur ».</li>
          </ol>
        ) : (
          <>
            <p className="text-sm">Connecté en tant que <strong>{session.user.email}</strong>. Aucun administrateur n'existe encore.</p>
            <Button onClick={claim}>Devenir administrateur</Button>
          </>
        )}
        <ErrorBox>{err}</ErrorBox><SuccessBox>{ok}</SuccessBox>
      </Card>
    </div>
  )
}
