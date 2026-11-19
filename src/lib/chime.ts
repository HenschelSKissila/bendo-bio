/**
 * Petit carillon BENDO BIO joué quand une notification arrive alors que l'application est ouverte
 * (le son système est utilisé quand elle est en arrière-plan ou fermée). Généré par Web Audio : aucun fichier.
 */
let ctx: AudioContext | null = null
let unlocked = false

// Les navigateurs n'autorisent le son qu'après un premier geste : on « déverrouille » au premier toucher.
if (typeof window !== 'undefined') {
  const unlock = () => {
    try { ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); ctx.resume(); unlocked = true } catch { /* ignore */ }
    window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock)
}

export function playChime(urgent = false) {
  try {
    navigator.vibrate?.(urgent ? [300, 120, 300] : [150, 80, 150])
    if (!unlocked || !ctx) return
    const notes = urgent ? [784, 988, 1175, 988, 1175] : [880, 1175]
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain(), t = ctx!.currentTime + i * 0.16
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
      o.connect(g).connect(ctx!.destination); o.start(t); o.stop(t + 0.32)
    })
  } catch { /* ignore */ }
}
