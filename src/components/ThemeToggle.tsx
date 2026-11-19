import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemeMode } from '../lib/theme'

const NEXT: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }
const INFO: Record<ThemeMode, { label: string; Icon: typeof Sun }> = {
  auto: { label: 'Auto', Icon: Monitor }, light: { label: 'Clair', Icon: Sun }, dark: { label: 'Sombre', Icon: Moon },
}

/** Bouton thème : Auto → Clair → Sombre (Auto suit le réglage de l'appareil). */
export default function ThemeToggle({ withLabel, className = '' }: { withLabel?: boolean; className?: string }) {
  const { mode, setMode } = useTheme()
  const { label, Icon } = INFO[mode]
  return (
    <button type="button" onClick={() => setMode(NEXT[mode])} title={`Thème : ${label} (cliquer pour changer)`} aria-label={`Thème : ${label}. Changer de thème`}
      className={`inline-flex items-center gap-1.5 rounded-xl p-2.5 text-brand-800 hover:bg-brand-50 ${className}`}>
      <Icon className="h-5 w-5" />{withLabel && <span className="text-xs font-semibold">{label}</span>}
    </button>
  )
}

/** Sélecteur explicite à 3 choix (page Compte / Paramètres). */
export function ThemeChoice() {
  const { mode, setMode } = useTheme()
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Thème d'affichage">
      {(['auto', 'light', 'dark'] as ThemeMode[]).map(m => { const { label, Icon } = INFO[m]; return (
        <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
          className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-semibold ${mode === m ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-700'}`}>
          <Icon className="h-5 w-5" />{label}{m === 'auto' && <span className="text-[10px] font-normal text-gray-500">selon l'appareil</span>}
        </button>) })}
    </div>
  )
}
