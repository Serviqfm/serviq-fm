// Tiny CSV helpers for import/export on the dashboard tables.
// Handles quoted fields with embedded commas, escaped quotes (""), and CRLF/LF.

// Neutralize CSV formula injection: a leading = + - @ (or tab/CR) makes Excel /
// Sheets treat a cell as a formula. Prefix an apostrophe so it renders as text.
// Plain numbers (incl. negatives) are left alone so they stay numeric. Used both
// on export and when echoing untrusted cells back in API messages (1C-28).
export function sanitizeCell(s: string): string {
  return /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s
}

export function exportCSV(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    alert('No rows to export.')
    return
  }
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = sanitizeCell(typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v)))
    return `"${s.replace(/"/g, '""')}"`
  }
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function parseCSV(text: string): Record<string, string>[] {
  // strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQ = false }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQ = true
      } else if (ch === ',') {
        cur.push(field); field = ''
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        cur.push(field); field = ''
        if (cur.some(c => c !== '')) rows.push(cur)
        cur = []
      } else {
        field += ch
      }
    }
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field)
    if (cur.some(c => c !== '')) rows.push(cur)
  }
  if (rows.length === 0) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(r => {
    const o: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) o[headers[i]] = (r[i] ?? '').trim()
    return o
  })
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
    reader.readAsText(file)
  })
}
