/**
 * Prépare une photo avant envoi : redimensionnée (1200 px max), recadrée au besoin en carré, en JPEG ~85 %.
 * Une photo de téléphone de 4–8 Mo devient ~150–300 Ko : chargement rapide pour les clients.
 */
export async function compressImage(file: File, max = 1200, square = false): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n\'est pas une image.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible.')); i.src = url })
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
    if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s }
    const scale = Math.min(1, max / Math.max(sw, sh))
    const c = document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale)
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok, ko) => c.toBlob(b => b ? ok(b) : ko(new Error('Conversion impossible.')), 'image/jpeg', 0.85))
  } finally { URL.revokeObjectURL(url) }
}

/** Vrai si l'image est une illustration par défaut (à remplacer par une photo). */
export const isPlaceholderImage = (url?: string | null) => !url || url.startsWith('/produits/') || url.startsWith('/rayons/')
