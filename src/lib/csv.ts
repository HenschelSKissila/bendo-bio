/** Export CSV daté (séparateur ; pour Excel FR, BOM UTF-8). */
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) { alert('Aucune donnée à exporter.'); return }
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    // protection contre l'injection de formules (=, +, -, @) dans Excel, sauf pour les nombres
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  a.href = URL.createObjectURL(blob); a.download = `bendo-${name}-${stamp}.csv`; a.click()
  URL.revokeObjectURL(a.href)
}
