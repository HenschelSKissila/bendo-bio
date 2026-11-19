import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useRealtime } from '../../lib/hooks'
import { money, num, UNIT_LABEL } from '../../lib/format'
import type { Product, Category, Stock, Unit } from '../../lib/types'
import { ProductImage } from '../../components/ProductCard'
import { Button, Card, Field, Input, Select, Textarea, Modal, ErrorBox, Spinner, Badge, Empty } from '../../components/ui'
import { useStaffBadges } from '../../lib/staffBadges'

const EMPTY: Partial<Product> = { sku: '', name: '', unit: 'piece', price: 0, tax_rate: 5.5, min_qty: 1, qty_step: 1, status: 'active',
  low_threshold: 10, critical_threshold: 3, organic: true, featured: false, variable_weight: false }

export function stockTone(p: Product, s?: Stock) {
  const av = Number(s?.available ?? 0)
  return av <= Number(p.critical_threshold) ? 'bg-red-100 text-red-800' : av <= Number(p.low_threshold) ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
}

export default function Products() {
  const { isAdmin } = useAuth()
  const [products, setProducts] = useState<Product[] | null>(null)
  const { b } = useStaffBadges()
  // horodatage de la visite précédente, figé à l'arrivée sur la page
  const [since, setSince] = useState<string | undefined>(undefined)
  useEffect(() => { if (b && since === undefined) setSince(b.since.products) }, [b, since])
  const [cats, setCats] = useState<Category[]>([])
  const [stock, setStock] = useState<Record<string, Stock>>({})
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [edit, setEdit] = useState<Partial<Product> | null>(null)
  const [catModal, setCatModal] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const [p, c, s] = await Promise.all([
      supabase.from('products').select('*').order('name'), supabase.from('categories').select('*').order('sort_order'), supabase.rpc('product_stock'),
    ])
    setProducts((p.data as Product[]) ?? []); setCats((c.data as Category[]) ?? [])
    setStock(Object.fromEntries(((s.data as Stock[]) ?? []).map(x => [x.product_id, x])))
  }, [])
  useEffect(() => { load() }, [load])
  useRealtime(['products', 'lots'], load)
  const list = useMemo(() => (products ?? []).filter(p => (!cat || p.category_id === cat)
    && (!q || `${p.name} ${p.sku} ${p.barcode ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [products, q, cat])

  async function save() {
    if (!edit) return
    setErr(null); setBusy(true)
    try {
      const { id, ...rest } = edit as Product
      const payload = { ...rest, barcode: rest.barcode || null, category_id: rest.category_id || null, expiry_alert_days: rest.expiry_alert_days || null }
      if (!payload.sku?.trim() || !payload.name?.trim()) throw new Error('SKU et nom obligatoires.')
      if (Number(payload.critical_threshold) > Number(payload.low_threshold)) throw new Error('Le seuil critique doit être inférieur ou égal au seuil bas.')
      const r = id ? await supabase.from('products').update(payload).eq('id', id) : await supabase.from('products').insert(payload)
      if (r.error) throw new Error(r.error.message)
      setEdit(null); load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  async function upload(file: File) {
    setErr(null); setBusy(true)
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('Image trop lourde (3 Mo max). Compressez-la.')
      const path = `${edit?.sku || 'produit'}-${Date.now()}.${file.name.split('.').pop()}`
      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      setEdit(e => ({ ...e!, image_url: data.publicUrl }))
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const set = (k: keyof Product, v: unknown) => setEdit(e => ({ ...e!, [k]: v }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-brand-900">Produits</h1>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => setCatModal(true)}>Catégories</Button>
          <Button onClick={() => { setErr(null); setEdit({ ...EMPTY, category_id: cats[0]?.id }) }}><Plus className="h-4 w-4" />Nouveau produit</Button>
        </div>
      </div>
      <Card className="grid gap-2 !p-3 sm:grid-cols-2">
        <Input type="search" placeholder="Nom, SKU ou code-barres" value={q} onChange={e => setQ(e.target.value)} />
        <Select value={cat} onChange={e => setCat(e.target.value)}><option value="">Toutes catégories</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </Card>
      {!products ? <Spinner /> : list.length === 0 ? <Empty>Aucun produit.</Empty> : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Produit</th><th>Prix</th><th>Physique</th><th>Réservé</th><th>Disponible</th><th>Seuils</th><th>Statut</th></tr></thead>
            <tbody className="divide-y">
              {list.map(p => { const s = stock[p.id]; return (
                <tr key={p.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => { setErr(null); setEdit(p) }}>
                  <td className="flex items-center gap-2 p-2"><ProductImage p={p} className="h-10 w-10 rounded-lg text-xl" /><div><div className="font-semibold">{p.name} {since && p.created_at && p.created_at > since && <Badge cls="bg-tomato text-white">Nouveau</Badge>}</div><div className="text-xs text-gray-500">{p.sku}{p.packaging ? ` · ${p.packaging}` : ''}</div></div></td>
                  <td>{money(p.price)}<span className="text-xs text-gray-500"> /{UNIT_LABEL[p.unit]}</span></td>
                  <td className="tabular-nums">{num(s?.physical)}</td>
                  <td className="tabular-nums">{num(s?.reserved)}</td>
                  <td><Badge cls={stockTone(p, s)}>{num(s?.available)} {UNIT_LABEL[p.unit]}</Badge></td>
                  <td className="text-xs text-gray-600">bas {num(p.low_threshold)} · crit. {num(p.critical_threshold)}</td>
                  <td><Badge cls={p.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}>{p.status === 'active' ? 'Actif' : p.status === 'hidden' ? 'Masqué' : 'Indisponible'}</Badge></td>
                </tr>) })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Modifier : ${edit.name}` : 'Nouveau produit'} wide>
        {edit && <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nom" required><Input value={edit.name ?? ''} onChange={e => set('name', e.target.value)} /></Field>
            <Field label="SKU (référence unique)" required><Input value={edit.sku ?? ''} onChange={e => set('sku', e.target.value.toUpperCase())} /></Field>
            <Field label="Code-barres EAN (si préemballé)"><Input value={edit.barcode ?? ''} onChange={e => set('barcode', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Catégorie"><Select value={edit.category_id ?? ''} onChange={e => set('category_id', e.target.value)}><option value="">—</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Unité de vente"><Select value={edit.unit} onChange={e => set('unit', e.target.value as Unit)}>{Object.entries(UNIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Conditionnement / variante"><Input value={edit.packaging ?? ''} onChange={e => set('packaging', e.target.value)} placeholder="barquette 500 g, calibre 2…" /></Field>
            <Field label="Prix TTC" required hint={!isAdmin ? 'Modifiable par l\'administrateur' : undefined}><Input type="number" step="0.01" min="0" value={edit.price ?? 0} disabled={!isAdmin && !!edit.id} onChange={e => set('price', parseFloat(e.target.value))} /></Field>
            <Field label="TVA %"><Input type="number" step="0.1" min="0" value={edit.tax_rate ?? 0} disabled={!isAdmin && !!edit.id} onChange={e => set('tax_rate', parseFloat(e.target.value))} /></Field>
            <Field label="Statut"><Select value={edit.status} onChange={e => set('status', e.target.value)}><option value="active">Actif (en vente)</option><option value="unavailable">Indisponible (visible)</option><option value="hidden">Masqué</option></Select></Field>
            <Field label="Quantité minimale"><Input type="number" step="0.001" min="0.001" value={edit.min_qty ?? 1} onChange={e => set('min_qty', parseFloat(e.target.value))} /></Field>
            <Field label="Pas de quantité" hint="ex. 0,5 kg"><Input type="number" step="0.001" min="0.001" value={edit.qty_step ?? 1} onChange={e => set('qty_step', parseFloat(e.target.value))} /></Field>
            <Field label="Alerte DLC (jours avant)" hint="Vide = règle de la catégorie"><Input type="number" min="0" value={edit.expiry_alert_days ?? ''} onChange={e => set('expiry_alert_days', e.target.value ? parseInt(e.target.value) : null)} /></Field>
            <Field label="Seuil bas"><Input type="number" step="0.001" min="0" value={edit.low_threshold ?? 0} disabled={!isAdmin && !!edit.id} onChange={e => set('low_threshold', parseFloat(e.target.value))} /></Field>
            <Field label="Seuil critique"><Input type="number" step="0.001" min="0" value={edit.critical_threshold ?? 0} disabled={!isAdmin && !!edit.id} onChange={e => set('critical_threshold', parseFloat(e.target.value))} /></Field>
            <Field label="Origine"><Input value={edit.origin ?? ''} onChange={e => set('origin', e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-700" checked={!!edit.variable_weight} onChange={e => set('variable_weight', e.target.checked)} />Poids variable (pesée à la préparation)</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-700" checked={!!edit.organic} onChange={e => set('organic', e.target.checked)} />Bio</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-700" checked={!!edit.featured} onChange={e => set('featured', e.target.checked)} />Mis en avant (accueil)</label>
          </div>
          <Field label="Description"><Textarea value={edit.description ?? ''} onChange={e => set('description', e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ingrédients"><Textarea value={edit.ingredients ?? ''} onChange={e => set('ingredients', e.target.value)} /></Field>
            <Field label="Allergènes" hint="Obligatoire avant la vente (info consommateur)"><Textarea value={edit.allergens ?? ''} onChange={e => set('allergens', e.target.value)} /></Field>
            <Field label="Conservation"><Textarea value={edit.conservation ?? ''} onChange={e => set('conservation', e.target.value)} /></Field>
          </div>
          <div className="flex items-center gap-3">
            {edit.image_url && <img src={edit.image_url} className="h-20 w-20 rounded-xl object-cover" alt="" />}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50">
              <Upload className="h-4 w-4" />Photo<input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            <Input placeholder="ou URL de l'image" value={edit.image_url ?? ''} onChange={e => set('image_url', e.target.value)} />
          </div>
          <ErrorBox>{err}</ErrorBox>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Annuler</Button><Button loading={busy} onClick={save}>Enregistrer</Button></div>
        </div>}
      </Modal>
      <CategoriesModal open={catModal} onClose={() => { setCatModal(false); load() }} cats={cats} />
    </div>
  )
}

function CategoriesModal({ open, onClose, cats }: { open: boolean; onClose: () => void; cats: Category[] }) {
  const [rows, setRows] = useState<Partial<Category>[]>([])
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (open) setRows(cats) }, [open, cats])
  async function saveRow(c: Partial<Category>) {
    setErr(null)
    const slug = (c.slug || c.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const payload = { name: c.name, slug, icon: c.icon || '🥬', sort_order: c.sort_order ?? 0, expiry_alert_days: c.expiry_alert_days || null, active: c.active ?? true }
    const r = c.id ? await supabase.from('categories').update(payload).eq('id', c.id) : await supabase.from('categories').insert(payload)
    if (r.error) setErr(r.error.message)
  }
  return (
    <Modal open={open} onClose={onClose} title="Catégories" wide>
      <div className="space-y-2">
        {rows.map((c, i) => (
          <div key={c.id ?? i} className="grid grid-cols-[3rem_1fr_5rem_6rem_auto] items-center gap-2">
            <Input value={c.icon ?? ''} onChange={e => setRows(r => r.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))} aria-label="Icône" />
            <Input value={c.name ?? ''} onChange={e => setRows(r => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} aria-label="Nom" />
            <Input type="number" value={c.sort_order ?? 0} onChange={e => setRows(r => r.map((x, j) => j === i ? { ...x, sort_order: parseInt(e.target.value) } : x))} aria-label="Ordre" />
            <Input type="number" placeholder="J-x DLC" value={c.expiry_alert_days ?? ''} onChange={e => setRows(r => r.map((x, j) => j === i ? { ...x, expiry_alert_days: e.target.value ? parseInt(e.target.value) : null } : x))} aria-label="Alerte DLC" />
            <Button variant="secondary" onClick={() => saveRow(c)}>OK</Button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => setRows(r => [...r, { name: '', icon: '🥬', sort_order: r.length + 1 }])}><Plus className="h-4 w-4" />Ajouter</Button>
        <p className="text-xs text-gray-500">Colonnes : icône, nom, ordre d'affichage, délai d'alerte DLC (jours) propre à la catégorie.</p>
        <ErrorBox>{err}</ErrorBox>
      </div>
    </Modal>
  )
}
