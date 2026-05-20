// Minimal markdown → HTML converter for our static legal/about pages.
// Avoids pulling in a heavyweight markdown library for a few documents.
//
// Supports: headings (# ## ###), bold (**text**), inline links [text](href),
// unordered lists (* or -), ordered lists (1. ), blockquotes (> ), paragraphs,
// hr (---), simple tables (| col | col |).
//
// Anything else passes through with HTML escaping.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(s: string): string {
  // bold then inline code then links (HTML-escape first so user content cannot inject tags)
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline">$1</a>')
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false
  let inP: string[] = []
  let inTable: { headers: string[]; rows: string[][] } | null = null

  const flushP = () => {
    if (inP.length > 0) {
      out.push(`<p>${inP.join(' ')}</p>`)
      inP = []
    }
  }
  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }
  const flushTable = () => {
    if (!inTable) return
    out.push('<div class="overflow-x-auto"><table class="min-w-full border border-outline-variant text-sm"><thead><tr>')
    out.push(inTable.headers.map(h => `<th class="px-3 py-2 text-left bg-surface-container-low border border-outline-variant">${inline(h.trim())}</th>`).join(''))
    out.push('</tr></thead><tbody>')
    for (const r of inTable.rows) {
      out.push('<tr>')
      out.push(r.map(c => `<td class="px-3 py-2 border border-outline-variant align-top">${inline(c.trim())}</td>`).join(''))
      out.push('</tr>')
    }
    out.push('</tbody></table></div>')
    inTable = null
  }

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]
    const trimmed = ln.trim()
    if (trimmed === '') { flushP(); closeLists(); flushTable(); continue }

    if (trimmed.startsWith('# ')) { flushP(); closeLists(); flushTable(); out.push(`<h1 class="text-3xl font-bold text-on-surface mt-8 mb-4">${inline(trimmed.slice(2))}</h1>`); continue }
    if (trimmed.startsWith('## ')) { flushP(); closeLists(); flushTable(); out.push(`<h2 class="text-2xl font-bold text-on-surface mt-6 mb-3">${inline(trimmed.slice(3))}</h2>`); continue }
    if (trimmed.startsWith('### ')) { flushP(); closeLists(); flushTable(); out.push(`<h3 class="text-xl font-semibold text-on-surface mt-4 mb-2">${inline(trimmed.slice(4))}</h3>`); continue }
    if (trimmed === '---') { flushP(); closeLists(); flushTable(); out.push('<hr class="my-6 border-outline-variant" />'); continue }
    if (trimmed.startsWith('> ')) { flushP(); closeLists(); flushTable(); out.push(`<blockquote class="border-l-4 border-primary pl-4 italic text-on-surface-variant my-3">${inline(trimmed.slice(2))}</blockquote>`); continue }

    // table row: starts and ends with |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushP(); closeLists()
      const cells = trimmed.slice(1, -1).split('|')
      // separator row (---|---) → ignore
      if (cells.every(c => /^[\s:-]+$/.test(c))) continue
      if (!inTable) inTable = { headers: cells, rows: [] }
      else inTable.rows.push(cells)
      continue
    } else if (inTable) {
      flushTable()
    }

    // bullet list
    if (/^[*-]\s+/.test(trimmed)) {
      flushP()
      if (inOl) { out.push('</ol>'); inOl = false }
      if (!inUl) { out.push('<ul class="list-disc pl-6 space-y-1 my-3">'); inUl = true }
      out.push(`<li>${inline(trimmed.replace(/^[*-]\s+/, ''))}</li>`)
      continue
    }
    // ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      flushP()
      if (inUl) { out.push('</ul>'); inUl = false }
      if (!inOl) { out.push('<ol class="list-decimal pl-6 space-y-1 my-3">'); inOl = true }
      out.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`)
      continue
    }

    closeLists()
    inP.push(inline(trimmed))
  }
  flushP(); closeLists(); flushTable()
  return out.join('\n')
}
