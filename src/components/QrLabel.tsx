import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * Étiquettes BENDO BIO.
 * Le QR code contient une ADRESSE WEB : tout téléphone qui le scanne ouvre la fiche de traçabilité
 * (produit, lot, date limite, origine). Un employé connecté y trouve les actions de stock.
 */
const origin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://bendo-bio.netlify.app')
export const lotUrl = (lotId: string) => `${origin()}/l/${lotId}`
export const orderTrackUrl = (orderNumber: string) => `${origin()}/suivi?n=${encodeURIComponent(orderNumber)}`
/** @deprecated ancien format, encore reconnu par le scanner */
export const lotQrValue = lotUrl

export function QrImg({ value, size = 120 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('')
  useEffect(() => { QRCode.toDataURL(value, { width: size * 3, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc) }, [value, size])
  return src ? <img src={src} width={size} height={size} alt={`QR ${value}`} /> : <div style={{ width: size, height: size }} />
}

export interface LabelData { id: string; product: string; lot: string; sku?: string; expiry?: string | null; kind?: string | null; qty?: string; received?: string }
export type LabelMode = 'qr' | 'simple'
export interface ParcelData { orderNumber: string; customer: string; phone?: string | null; area?: string | null; address?: string | null; slot?: string; items: number }

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const CSS = `
  @page { margin: 5mm }
  body{font-family:Inter,system-ui,Arial,sans-serif;margin:0;padding:4mm;color:#0f2818}
  .bar{position:sticky;top:0;background:#1f5130;color:#fff;padding:8px 12px;border-radius:8px;margin-bottom:8px;font-size:14px}
  .bar button{background:#fff;color:#1f5130;border:0;border-radius:6px;padding:6px 14px;font-weight:700;margin-left:8px}
  .l{display:inline-flex;gap:3mm;align-items:center;border:1px dashed #9ca3af;border-radius:2mm;padding:2.5mm;margin:1.5mm;box-sizing:border-box;page-break-inside:avoid;vertical-align:top;overflow:hidden;background:#fff}
  .lot{width:70mm;height:38mm}.simple{width:62mm;height:30mm}.parcel{width:100mm;height:62mm;align-items:stretch}
  .qr{width:30mm;height:30mm;flex:none}.parcel .qr{width:36mm;height:36mm}
  .t{min-width:0;flex:1;line-height:1.15}
  .logo{height:9mm;width:9mm;object-fit:contain;vertical-align:middle}
  .brand{font-size:7.5pt;font-weight:700;color:#1f5130;display:flex;align-items:center;gap:1.5mm}
  .p{font-weight:800;font-size:11pt;margin:1mm 0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .c{font-family:ui-monospace,Consolas,monospace;font-size:8.5pt}
  .d{font-weight:800;font-size:13pt;border:1.5px solid #0f2818;border-radius:1.5mm;padding:0.5mm 1.5mm;display:inline-block;margin-top:1mm}
  .s{font-size:7pt;color:#374151}
  .on{font-family:ui-monospace,Consolas,monospace;font-size:15pt;font-weight:800}
  .big{font-size:12pt;font-weight:700}
  @media print{.bar{display:none}.l{border-color:#d1d5db}}`

/** Fenêtre d'impression : attend le chargement des images (logo + QR) avant d'imprimer. */
async function openPrint(title: string, html: string) {
  const w = window.open('', '_blank', 'width=900,height=900')   // ouverture synchrone (iPhone)
  if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer.'); return null }
  w.document.write('<p style="font-family:sans-serif">Préparation des étiquettes…</p>')
  return (body: string) => {
    w.document.open()
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>
      <div class="bar">Aperçu des étiquettes <button onclick="window.print()">Imprimer</button></div>${html.replace('%BODY%', body)}
      <script>Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),250))</script>
      </body></html>`)
    w.document.close()
  }
}

/** Étiquettes de lot : 'qr' (bac, cagette, sachet) ou 'simple' (logo + référence + date, sans QR). */
export async function printLabels(labels: LabelData[], mode: LabelMode = 'qr') {
  const write = await openPrint('Étiquettes lots BENDO BIO', '%BODY%')
  if (!write) return
  const logo = `${origin()}/logo.png`
  const qrs = mode === 'qr' ? await Promise.all(labels.map(l => QRCode.toDataURL(lotUrl(l.id), { width: 360, margin: 1, errorCorrectionLevel: 'M' }))) : []
  write(labels.map((l, i) => mode === 'qr'
    ? `<div class="l lot"><img class="qr" src="${qrs[i]}" alt=""/><div class="t">
        <div class="brand"><img class="logo" src="${logo}" alt=""/>BENDO BIO</div>
        <div class="p">${esc(l.product)}</div>
        <div class="c">Lot ${esc(l.lot)}${l.sku ? ` · ${esc(l.sku)}` : ''}</div>
        ${l.expiry ? `<div class="d">${esc(l.kind || 'DLC')} ${esc(l.expiry)}</div>` : ''}
        <div class="s">${l.qty ? esc(l.qty) + ' · ' : ''}${l.received ? 'Reçu ' + esc(l.received) : ''}</div></div></div>`
    : `<div class="l simple"><img class="logo" style="height:16mm;width:16mm" src="${logo}" alt=""/><div class="t">
        <div class="p">${esc(l.product)}</div>
        <div class="c">Réf. ${esc(l.sku || '')} · Lot ${esc(l.lot)}</div>
        ${l.expiry ? `<div class="d">${esc(l.kind || 'DLC')} ${esc(l.expiry)}</div>` : '<div class="s">Sans date limite</div>'}</div></div>`).join(''))
}

/** Étiquette de colis (sac / carton de la commande) : le client scanne → suivi de sa commande. */
export async function printParcelLabel(p: ParcelData) {
  const write = await openPrint(`Colis ${p.orderNumber}`, '%BODY%')
  if (!write) return
  const qr = await QRCode.toDataURL(orderTrackUrl(p.orderNumber), { width: 400, margin: 1, errorCorrectionLevel: 'M' })
  write(`<div class="l parcel"><div style="display:flex;flex-direction:column;align-items:center;gap:1mm"><img class="qr" src="${qr}" alt=""/><div class="s">Scannez pour suivre</div></div>
    <div class="t">
      <div class="brand"><img class="logo" src="${origin()}/logo.png" alt=""/>BENDO BIO · +242 06 606 70 58</div>
      <div class="on">${esc(p.orderNumber)}</div>
      <div class="big">${esc(p.customer)}</div>
      ${p.phone ? `<div>📞 ${esc(p.phone)}</div>` : ''}
      ${p.area ? `<div class="big">📍 ${esc(p.area)}</div>` : ''}
      ${p.address ? `<div class="s">${esc(p.address)}</div>` : ''}
      ${p.slot ? `<div style="margin-top:1mm"><b>Créneau :</b> ${esc(p.slot)}</div>` : ''}
      <div class="s" style="margin-top:1mm">${p.items} article(s) · vérifié par nos agents</div>
    </div></div>`)
}
