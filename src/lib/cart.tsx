import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface CartLine { product_id: string; quantity: number }
interface CartCtx {
  lines: CartLine[]; count: number
  set: (id: string, qty: number) => void; add: (id: string, qty: number) => void; remove: (id: string) => void; clear: () => void
}
const Ctx = createContext<CartCtx>(null as unknown as CartCtx)
const KEY = 'bendo-cart-v1'

function load(): CartLine[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)) } catch { /* stockage indisponible */ } }, [lines])
  const round = (n: number) => Math.round(n * 1000) / 1000
  const set = (id: string, qty: number) =>
    setLines(ls => qty <= 0 ? ls.filter(l => l.product_id !== id)
      : ls.some(l => l.product_id === id) ? ls.map(l => l.product_id === id ? { ...l, quantity: round(qty) } : l)
      : [...ls, { product_id: id, quantity: round(qty) }])
  const add = (id: string, qty: number) => set(id, (lines.find(l => l.product_id === id)?.quantity ?? 0) + qty)
  return (
    <Ctx.Provider value={{
      lines, count: lines.length, set, add,
      remove: id => setLines(ls => ls.filter(l => l.product_id !== id)),
      clear: () => setLines([]),
    }}>{children}</Ctx.Provider>
  )
}
export const useCart = () => useContext(Ctx)
