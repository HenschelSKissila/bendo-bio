import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Contenu des QR codes BENDO BIO : un QR par LOT (bac, cagette, sachet). */
export const lotQrValue = (lotId: string) => `BENDO:LOT:${lotId}`
export const productQrValue = (sku: string) => `BENDO:PRD:${sku}`

export function QrImg({ value, size = 120 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('')
  useEffect(() => { QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc) }, [value, size])
  return src ? <img src={src} width={size} height={size} alt={`QR ${value}`} /> : <div style={{ width: size, height: size }} />
}

export interface LabelData { id: string; product: string; lot: string; expiry?: string | null; kind?: string | null; qty?: string; received?: string }

/** Ouvre une fenêtre d'impression d'étiquettes (format 62 mm, imprimante thermique ou A4). */
export async function printLabels(labels: LabelData[]) {
  // ouverture synchrone dans le clic : sinon Safari/iOS bloque la fenêtre
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer.'); return }
  w.document.write('<p style="font-family:sans-serif">Préparation des étiquettes…</p>')
  const imgs = await Promise.all(labels.map(l => QRCode.toDataURL(lotQrValue(l.id), { width: 300, margin: 1 })))
  w.document.open()
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Étiquettes lots</title><style>
    body{font-family:system-ui,sans-serif;margin:0;padding:8px}
    .l{display:inline-flex;gap:8px;align-items:center;width:62mm;height:32mm;border:1px dashed #999;padding:2mm;margin:2mm;box-sizing:border-box;page-break-inside:avoid;vertical-align:top}
    .l img{width:26mm;height:26mm}.t{font-size:10pt;line-height:1.2}.p{font-weight:700;font-size:11pt}.d{font-weight:700;font-size:12pt}
    @media print{.l{border:none}}</style></head><body>
    ${labels.map((l, i) => `<div class="l"><img src="${imgs[i]}"/><div class="t"><div class="p">${esc(l.product)}</div>
      <div>Lot ${esc(l.lot)}</div>${l.expiry ? `<div class="d">${esc(l.kind || 'DLC')} ${esc(l.expiry)}</div>` : ''}
      ${l.qty ? `<div>${esc(l.qty)}</div>` : ''}${l.received ? `<div style="font-size:8pt">Reçu ${esc(l.received)}</div>` : ''}<div style="font-size:7pt">BENDO BIO</div></div></div>`).join('')}
    <script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`)
  w.document.close()
}
