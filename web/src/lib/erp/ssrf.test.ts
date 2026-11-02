import { describe, it, expect } from 'vitest'
import { assertPublicHttpsUrl, isPrivateAddress } from './ssrf'

const resolveTo = (...ips: string[]) => async () => ips

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1',
    '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1', 'not-an-ip',
  ])('blocks %s', ip => expect(isPrivateAddress(ip)).toBe(true))

  it.each(['8.8.8.8', '172.32.0.1', '20.190.160.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s', ip => expect(isPrivateAddress(ip)).toBe(false))
})

describe('assertPublicHttpsUrl — SSRF guard', () => {
  it('accepts a public https host', async () => {
    await expect(assertPublicHttpsUrl('https://acme.odoo.com', resolveTo('34.1.2.3'))).resolves.toBeInstanceOf(URL)
  })

  it.each([
    ['http://acme.odoo.com', /https/],
    ['https://user:pw@acme.odoo.com', /credentials/],
    ['https://localhost:8069', /public domain/],
    ['https://intranet', /public domain/],
    ['https://erp.corp.internal', /public domain/],
    ['https://127.0.0.1', /private/],
    ['https://[::1]/jsonrpc', /private/],
    ['https://169.254.169.254/latest/meta-data', /private/],
    ['not a url', /not valid/],
  ])('rejects %s', async (url, msg) => {
    await expect(assertPublicHttpsUrl(url, resolveTo('34.1.2.3'))).rejects.toThrow(msg)
  })

  it('rejects a public-looking name that resolves to a private address', async () => {
    await expect(assertPublicHttpsUrl('https://erp.example.com', resolveTo('34.1.2.3', '10.0.0.5'))).rejects.toThrow(/resolves to a private/)
  })

  it('rejects a host that does not resolve', async () => {
    await expect(assertPublicHttpsUrl('https://nope.example.com', async () => { throw new Error('ENOTFOUND') })).rejects.toThrow(/could not be resolved/)
  })
})
