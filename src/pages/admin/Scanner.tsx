import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, CameraOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { num, UNIT_LABEL, fmtDay } from '../../lib/format'
import type { Lot, Product, Stock } from '../../lib/types'
import LotActionModal, { type LotAction } from '../../components/LotActions'
import { Reception, expiryBadge, LOT_STATUS } from './Stock'
import { Button, Card, Input, ErrorBox, Badge } from '../../components/ui'

/**
 * Scanner : QR code BENDO (étiquette de lot) ou code-barres EAN (produit préemballé).
 * Fonctionne avec la caméra du smartphone, ou une douchette USB/Bluetooth (saisie clavier).
 */
export default function Scanner() {
  const [on, setOn] = useState(false)
  const [code, setCode] = useState('')
  const [lot, setLot] = useState<Lot | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  const [lots, setLots] = useState<Lot[]>([])
  const [stock, setStock] = useState<Stock | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [action, setAction] = useState<{ lot: Lot; action: LotAction } | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const qr = useRef<Html5Qrcode | null>(null)
  const last = useRef('')

  useEffect(() => { supabase.from('products').select('*').order('name').then(({ data }) => setProducts((data as Product[]) ?? [])) }, [])

  const lookup = useCallback(async (raw: string) => {
    const v = raw.trim(); if (!v) return
    setErr(null); setLot(null); setProduct(null); setLots([]); setStock(null)
    let p: Product | null = null
    const lotMatch = v.match(/^BENDO:LOT:([0-9a-f-]{36})$/i)
    if (lotMatch) {
      const { data } = await supabase.from('lots').select('*').eq('id', lotMatch[1]).maybeSingle()
      if (!data) { setErr('Lot introuvable.'); return }
      setLot(data as Lot)
      p = (await supabase.from('products').select('*').eq('id', (data as Lot).product_id).single()).data as Product
    } else {
      const sku = v.replace(/^BENDO:PRD:/i, '')
      const { data } = await supabase.from('products').select('*').or(`barcode.eq.${sku},sku.eq.${sku.toUpperCase()}`).limit(1)
      p = (data as Product[])?.[0] ?? null
      if (!p) {
        const { data: l } = await supabase.from('lots').select('*').eq('lot_number', v).limit(1)
        if (l?.[0]) { setLot(l[0] as Lot); p = (await supabase.from('products').select('*').eq('id', (l[0] as Lot).product_id).single()).data as Product }
      }
      if (!p) { setErr(`Code « ${v} » inconnu. Associez ce code-barres à un produit (Produits > champ EAN).`); return }
    }
    setProduct(p)
    const [ls, st] = await Promise.all([
      supabase.from('lots').select('*').eq('product_id', p.id).neq('status', 'depleted').order('expiry_date', { nullsFirst: false }),
      supabase.rpc('product_stock'),
    ])
    setLots((ls.data as Lot[]) ?? [])
    setStock(((st.data as Stock[]) ?? []).find(s => s.product_id === p!.id) ?? null)
    try { navigator.vibrate?.(80) } catch { /* ignore */ }
  }, [])

  async function start() {
    setErr(null)
    try {
      const h = new Html5Qrcode('qr-reader', { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.UPC_A] })
      qr.current = h
      await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 180 } }, text => {
        if (text === last.current) return
        last.current = text; setTimeout(() => { last.current = '' }, 2500)
        setCode(text); lookup(text)
      }, () => {})
      setOn(true)
    } catch (e) { setErr(`Caméra indisponible : ${(e as Error)?.message ?? e}. Autorisez l'accès à la caméra (HTTPS requis) ou saisissez le code.`) }
  }
  async function stop() { try { await qr.current?.stop(); qr.current?.clear() } catch { /* ignore */ } setOn(false) }
  useEffect(() => () => { qr.current?.stop().catch(() => {}) }, [])
  const refresh = () => product && lookup(lot ? `BENDO:LOT:${lot.id}` : product.sku)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Scanner</h1>
      <Card className="space-y-3">
        <div id="qr-reader" className={`overflow-hidden rounded-xl ${on ? '' : 'hidden'}`} />
        <div className="flex flex-wrap gap-2">
          {on ? <Button variant="secondary" onClick={stop}><CameraOff className="h-4 w-4" />Arrêter la caméra</Button>
            : <Button onClick={start}><Camera className="h-4 w-4" />Scanner avec la caméra</Button>}
        </div>
        <form onSubmit={e => { e.preventDefault(); lookup(code) }} className="flex gap-2">
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Ou saisir / douchette : code-barres, SKU, n° de lot" autoFocus />
          <Button type="submit" variant="secondary">OK</Button>
        </form>
        <ErrorBox>{err}</ErrorBox>
      </Card>

      {product && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><div className="text-lg font-bold">{product.name}</div><div className="text-xs text-gray-500">{product.sku}{product.barcode ? ` · EAN ${product.barcode}` : ''}</div></div>
            {stock && <div className="text-right text-sm">Disponible <strong className="text-lg">{num(stock.available)} {UNIT_LABEL[product.unit]}</strong><div className="text-xs text-gray-500">physique {num(stock.physical)} · réservé {num(stock.reserved)}</div></div>}
          </div>
          {lot && (
            <div className="rounded-2xl border-2 border-brand-300 bg-brand-50 p-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono font-bold">Lot {lot.lot_number}</span>{expiryBadge(lot)}<Badge cls={LOT_STATUS[lot.status][1]}>{LOT_STATUS[lot.status][0]}</Badge></div>
              <div className="mt-1 text-sm">Restant : <strong>{num(lot.qty_remaining)} {UNIT_LABEL[product.unit]}</strong> · reçu {fmtDay(lot.received_at)} · {lot.supplier ?? '—'}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button variant="danger" onClick={() => setAction({ lot, action: 'adjust' })}>Sortie / perte</Button>
                <Button variant="secondary" onClick={() => setAction({ lot, action: 'inventory' })}>Compter</Button>
                {lot.status === 'active' ? <Button variant="warning" onClick={() => setAction({ lot, action: 'block' })}>Bloquer</Button>
                  : lot.status === 'blocked' ? <Button onClick={() => setAction({ lot, action: 'unblock' })}>Débloquer</Button> : <span />}
                <Button variant="secondary" onClick={() => setAction({ lot, action: 'trace' })}>Traçabilité</Button>
              </div>
            </div>
          )}
          {!lot && lots.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-semibold">Lots en stock (ordre FEFO — à sortir en premier en haut)</div>
              <ul className="divide-y rounded-xl border">
                {lots.map(l => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                    <span className="font-mono text-xs">{l.lot_number}</span>{expiryBadge(l)}<span className="ml-auto font-semibold">{num(l.qty_remaining)}</span>
                    <button className="rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700" onClick={() => setAction({ lot: l, action: 'adjust' })}>Sortie</button>
                    <button className="rounded-lg bg-gray-100 px-2 py-1 text-xs" onClick={() => setAction({ lot: l, action: 'inventory' })}>Compter</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="rounded-xl border p-2"><summary className="cursor-pointer text-sm font-semibold text-brand-700">+ Réceptionner ce produit (nouveau lot)</summary>
            <div className="mt-2"><Reception key={product.id} products={products} presetProduct={product.id} onDone={refresh} /></div>
          </details>
        </Card>
      )}
      <LotActionModal lot={action?.lot ?? null} action={action?.action ?? null} product={product ?? undefined} onClose={() => setAction(null)} onDone={refresh} />
      <Card className="text-sm text-gray-600">
        <h2 className="mb-1 font-semibold text-gray-800">Comment ça marche ?</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Produits frais en vrac</strong> (tomates, oignons…) : chaque lot reçoit une <strong>étiquette QR</strong> imprimée à la réception, collée sur le bac/la cagette. Scanner l'étiquette ouvre le lot (sortie, perte, inventaire, blocage).</li>
          <li><strong>Produits préemballés</strong> (œufs, épicerie) : saisissez leur <strong>code-barres EAN</strong> dans la fiche produit ; le scan ouvre le produit et ses lots.</li>
          <li>Une <strong>douchette</strong> USB/Bluetooth fonctionne aussi : cliquez dans le champ et scannez.</li>
        </ul>
      </Card>
    </div>
  )
}
