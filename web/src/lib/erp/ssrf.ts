// W7-02 — SSRF guard for user-supplied ERP endpoints (Odoo URL, Oracle URL and
// token URL). SERVER ONLY.
//
// The two existing guards don't fit here: lib/branding.ts's isSafeLogoUrl pins
// logos to our own Supabase origin (an ERP is never there), and the webhook
// route's isBlockedHost is a route-local, hostname-string check that a DNS name
// pointing at 10.0.0.5 walks straight past. This guard is a superset of both:
//   * https only, no userinfo in the URL, no single-label / .local / .internal hosts
//   * IP literals AND every address the hostname resolves to must be public
//     (blocks loopback, RFC1918, CGNAT, link-local incl. 169.254.169.254 cloud
//     metadata, multicast, reserved, IPv6 ULA/link-local, v4-mapped IPv6).
// It runs at save time AND before every outbound request, and adapters fetch with
// redirect:'manual' so a public host can't 302 us into the private network.
//
// ponytail: a resolve-then-connect gap (DNS rebinding) remains — closing it means
// pinning the connection to the vetted IP via a custom undici dispatcher. Worth
// doing if ERP endpoints ever become untrusted-tenant input at scale.

import { isIP } from 'net'
import { lookup } from 'dns/promises'

export type Resolver = (hostname: string) => Promise<string[]>

export class SsrfError extends Error {
  constructor(message: string) { super(message); this.name = 'SsrfError' }
}

const defaultResolver: Resolver = async host => {
  const res = await lookup(host, { all: true, verbatim: true })
  return res.map(r => r.address)
}

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0
}

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]

function isPrivateV4(ip: string): boolean {
  const n = v4ToInt(ip)
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (n & mask) === (v4ToInt(base) & mask)
  })
}

/** Expand an IPv6 address to 8 numeric hextets (handles :: and a dotted v4 tail). */
function expandV6(ip: string): number[] | null {
  let addr = ip.toLowerCase().split('%')[0]
  const v4Tail = addr.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4Tail) {
    const n = v4ToInt(v4Tail[1])
    addr = addr.slice(0, -v4Tail[1].length) + ((n >>> 16).toString(16)) + ':' + ((n & 0xffff).toString(16))
  }
  const [head, tail] = addr.split('::')
  const h = head ? head.split(':') : []
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : null
  const groups = t === null ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t]
  if (groups.length !== 8) return null
  const nums = groups.map(g => parseInt(g, 16))
  return nums.some(n => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums
}

export function isPrivateAddress(ip: string): boolean {
  const fam = isIP(ip)
  if (fam === 4) return isPrivateV4(ip)
  if (fam !== 6) return true // not an IP at all: refuse rather than guess
  const g = expandV6(ip)
  if (!g) return true
  const allZeroPrefix = g.slice(0, 5).every(x => x === 0)
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible) → judge the embedded v4.
  if (allZeroPrefix && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && (g[7] === 0 || g[7] === 1)) return true // :: and ::1
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`
    return isPrivateV4(v4)
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // documentation
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true // NAT64 — could reach v4 privates
  if (g[0] === 0x2002) return true // 6to4 — embeds arbitrary v4
  return false
}

function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (!h.includes('.')) return true // single-label: localhost, metadata, intranet names
  return h === 'localhost' || /\.(localhost|local|internal|intranet|lan|home\.arpa)$/.test(h)
}

/**
 * Throws SsrfError unless `raw` is an https URL whose host is public. Returns the
 * parsed URL. `resolve` is injectable for tests.
 */
export async function assertPublicHttpsUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let u: URL
  try { u = new URL(raw) } catch { throw new SsrfError('URL is not valid') }
  if (u.protocol !== 'https:') throw new SsrfError('URL must use https')
  if (u.username || u.password) throw new SsrfError('URL must not contain credentials')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new SsrfError('URL points at a private or reserved address')
    return u
  }
  if (isBlockedHostname(host)) throw new SsrfError('URL host must be a public domain name')
  let addrs: string[]
  try { addrs = await resolve(host) } catch { throw new SsrfError('URL host could not be resolved') }
  if (addrs.length === 0) throw new SsrfError('URL host could not be resolved')
  if (addrs.some(isPrivateAddress)) throw new SsrfError('URL host resolves to a private or reserved address')
  return u
}
