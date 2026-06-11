// web/src/lib/escapeHtml.ts
//
// Tiny HTML-escaping helper for user-supplied values interpolated into
// notification email HTML (Sprint K security hardening). Escapes the five
// characters that matter for both text nodes and attribute values.

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
