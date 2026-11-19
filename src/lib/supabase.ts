import { createClient } from '@supabase/supabase-js'

// Valeurs par défaut = projet BENDO BIO. Surchargées par les variables d'environnement
// (fichier .env en local, "Environment variables" sur Netlify).
// La clé publishable est publique par conception ; la protection des données est assurée par RLS.
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://yrpwtexcsmioecupfuze.supabase.co'
export const SUPABASE_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_OP-CuIwbOUixZm92zIZMfg_xiw1H30l'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } },
})

/** Appel RPC avec message d'erreur lisible en français. */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

const CODES: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Stock insuffisant',
  SLOT_FULL: 'Créneau complet',
  OUT_OF_ZONE: 'Adresse hors zone',
  FORBIDDEN: 'Action non autorisée',
  REASON_REQUIRED: 'Motif obligatoire',
  INVALID_TRANSITION: 'Changement de statut impossible',
  NEGATIVE_STOCK: 'Stock insuffisant dans ce lot',
}

export function friendlyError(msg: string): string {
  if (!msg) return 'Erreur inconnue'
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Connexion à la base impossible. Vérifiez votre connexion internet.'
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou mot de passe incorrect.'
  if (/Email not confirmed/i.test(msg)) return 'Adresse e-mail non confirmée : cliquez sur le lien reçu par e-mail.'
  if (/User already registered/i.test(msg)) return 'Un compte existe déjà avec cet e-mail.'
  if (/Password should be/i.test(msg)) return 'Mot de passe trop court (8 caractères minimum).'
  if (/invalid input value for enum user_role/i.test(msg)) return 'Le rôle « Livreur » n\'existe pas encore dans la base : exécutez le script 008_livreurs.sql dans Supabase.'
  if (/row-level security|permission denied/i.test(msg)) return 'Action non autorisée pour votre rôle.'
  if (/Could not find the function|schema cache/i.test(msg))
    return 'Fonction absente de la base : exécutez le dernier script SQL (voir README), puis rechargez la page.'
  if (/function .* does not exist/i.test(msg))
    return `Erreur technique de la base (${msg}). Exécutez le dernier script SQL de mise à jour.`
  const m = msg.match(/^([A-Z_]+):\s*([\s\S]*)$/)
  if (m) return m[2] || CODES[m[1]] || m[1]
  return msg
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : friendlyError(String((e as { message?: string })?.message ?? e))
}
