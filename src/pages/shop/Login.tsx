import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase, errMsg, friendlyError } from '../../lib/supabase'
import { Button, Card, Field, Input, ErrorBox, SuccessBox } from '../../components/ui'

export default function Login() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const staff = sp.get('staff') === '1'
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(sp.get('mode') === 'signup' ? 'signup' : 'login')
  const [f, setF] = useState({ email: '', password: '', name: '', phone: '', marketing: false })
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setOk(null); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
        if (error) throw new Error(friendlyError(error.message))
        nav(sp.get('next') || (staff ? '/admin' : '/compte'))
      } else if (mode === 'signup') {
        if (f.password.length < 8) throw new Error('Mot de passe : 8 caractères minimum.')
        const { data, error } = await supabase.auth.signUp({
          email: f.email.trim(), password: f.password,
          options: { data: { full_name: f.name, phone: f.phone, marketing_consent: f.marketing }, emailRedirectTo: window.location.origin + '/compte' },
        })
        if (error) throw new Error(friendlyError(error.message))
        if (data.session) nav(sp.get('next') || '/compte')
        else setOk('Compte créé ! Confirmez votre adresse via le lien reçu par e-mail, puis connectez-vous.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: window.location.origin + '/compte?reset=1' })
        if (error) throw new Error(friendlyError(error.message))
        setOk('Si un compte existe, un lien de réinitialisation (à usage unique) vient d\'être envoyé.')
      }
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <div className="mb-4 text-center">
          <img src="/logo.jpg" alt="" className="mx-auto h-20 w-20 rounded-full" />
          <h1 className="mt-2 text-xl font-bold text-brand-900">
            {mode === 'login' ? (staff ? 'Connexion personnel' : 'Connexion') : mode === 'signup' ? 'Créer un compte' : 'Mot de passe oublié'}
          </h1>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && <>
            <Field label="Nom complet" required><Input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
            <Field label="Téléphone" required><Input required type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
          </>}
          <Field label="E-mail" required><Input required type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
          {mode !== 'reset' && <Field label="Mot de passe" required hint={mode === 'signup' ? '8 caractères minimum' : undefined}>
            <Input required type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </Field>}
          {mode === 'signup' && <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={f.marketing} onChange={e => setF({ ...f, marketing: e.target.checked })} className="mt-1 accent-brand-700" />
            J'accepte de recevoir les offres BENDO BIO (facultatif, séparé de la commande).
          </label>}
          <ErrorBox>{err}</ErrorBox><SuccessBox>{ok}</SuccessBox>
          <Button type="submit" className="w-full" loading={busy}>{mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'}</Button>
        </form>
        <div className="mt-4 flex flex-col items-center gap-1 text-sm">
          {mode !== 'login' && <button className="text-brand-700 hover:underline" onClick={() => setMode('login')}>J'ai déjà un compte</button>}
          {mode === 'login' && <button className="text-brand-700 hover:underline" onClick={() => setMode('signup')}>Créer un compte</button>}
          {mode === 'login' && <button className="text-gray-500 hover:underline" onClick={() => setMode('reset')}>Mot de passe oublié ?</button>}
          <Link to="/installation" className="mt-2 text-xs text-gray-400 hover:underline">Première installation (création de l'administrateur)</Link>
        </div>
      </Card>
    </div>
  )
}
