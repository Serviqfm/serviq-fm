// W7-02 — per-provider connection fields, shared by the settings page (client)
// and the admin API routes (server). PURE: no node imports, no secrets — it only
// describes which fields exist, which of them are secret, and how to validate the
// non-secret ones.
//
// Split of storage:
//   * secret: false → erp_connections.config (plain JSONB, admin-readable)
//   * secret: true  → erp_credentials.ciphertext (AES-256-GCM, service role only)

export type ConnectorProvider = 'odoo' | 'dynamics' | 'oracle'
export const CONNECTOR_PROVIDERS: readonly ConnectorProvider[] = ['odoo', 'dynamics', 'oracle']

export function isConnectorProvider(p: unknown): p is ConnectorProvider {
  return typeof p === 'string' && (CONNECTOR_PROVIDERS as readonly string[]).includes(p)
}

export type FieldSpec = {
  key: string
  en: string
  ar: string
  secret: boolean
  required: boolean
  kind: 'url' | 'text' | 'number' | 'select'
  options?: { value: string; en: string; ar: string }[]
  placeholder?: string
  /** Only shown/required when another field has this value (e.g. Oracle auth mode). */
  showWhen?: { key: string; value: string }
  pattern?: RegExp
  patternHint?: string
  defaultValue?: string
  help?: { en: string; ar: string }
}

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
// Entra tenant: a GUID or a verified domain (contoso.onmicrosoft.com).
const TENANT = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+)$/
export const BC_PATTERNS = {
  tenantId: TENANT,
  clientId: GUID,
  companyId: GUID,
  environment: /^[A-Za-z0-9_-]{1,50}$/,
}

export const PROVIDER_FIELDS: Record<ConnectorProvider, FieldSpec[]> = {
  odoo: [
    { key: 'baseUrl', en: 'Odoo URL', ar: 'رابط أودو', secret: false, required: true, kind: 'url', placeholder: 'https://mycompany.odoo.com' },
    { key: 'database', en: 'Database', ar: 'قاعدة البيانات', secret: false, required: true, kind: 'text', placeholder: 'mycompany' },
    { key: 'username', en: 'Username (login email)', ar: 'اسم المستخدم (البريد)', secret: false, required: true, kind: 'text' },
    { key: 'apiKey', en: 'API key', ar: 'مفتاح API', secret: true, required: true, kind: 'text' },
    {
      key: 'defaultProductId', en: 'Default product ID (PO / bill lines)', ar: 'معرّف المنتج الافتراضي (بنود أوامر الشراء والفواتير)',
      secret: false, required: false, kind: 'number', pattern: /^\d{1,12}$/, patternHint: 'a numeric product.product id',
      help: { en: 'Odoo requires a product on every purchase order line.', ar: 'يتطلب أودو منتجاً في كل بند من بنود أمر الشراء.' },
    },
  ],
  dynamics: [
    { key: 'tenantId', en: 'Tenant ID (Entra ID)', ar: 'معرّف المستأجر (Entra ID)', secret: false, required: true, kind: 'text', pattern: TENANT, patternHint: 'a GUID or domain' },
    { key: 'clientId', en: 'Client (application) ID', ar: 'معرّف التطبيق', secret: false, required: true, kind: 'text', pattern: GUID, patternHint: 'a GUID' },
    { key: 'clientSecret', en: 'Client secret', ar: 'السر الخاص بالتطبيق', secret: true, required: true, kind: 'text' },
    { key: 'environment', en: 'Environment', ar: 'البيئة', secret: false, required: true, kind: 'text', pattern: BC_PATTERNS.environment, patternHint: 'letters, digits, - or _', defaultValue: 'production' },
    { key: 'companyId', en: 'Company ID', ar: 'معرّف الشركة', secret: false, required: true, kind: 'text', pattern: GUID, patternHint: 'a GUID' },
    {
      key: 'glAccountNumber', en: 'G/L account no. (PO / invoice lines)', ar: 'رقم حساب الأستاذ العام (للبنود)',
      secret: false, required: false, kind: 'text', pattern: /^[A-Za-z0-9._-]{1,20}$/, patternHint: 'a G/L account number',
      help: { en: 'Lines are posted as G/L Account lines against this account.', ar: 'تُرحَّل البنود كبنود حساب أستاذ عام على هذا الحساب.' },
    },
  ],
  oracle: [
    { key: 'baseUrl', en: 'Oracle Fusion URL', ar: 'رابط أوراكل فيوجن', secret: false, required: true, kind: 'url', placeholder: 'https://abcd.fa.ocs.oraclecloud.com' },
    {
      key: 'authMode', en: 'Authentication', ar: 'المصادقة', secret: false, required: true, kind: 'select', defaultValue: 'basic',
      options: [
        { value: 'basic', en: 'Basic (username + password)', ar: 'أساسية (اسم مستخدم + كلمة مرور)' },
        { value: 'oauth', en: 'OAuth 2.0 client credentials', ar: 'OAuth 2.0 (بيانات اعتماد العميل)' },
      ],
    },
    { key: 'username', en: 'Username', ar: 'اسم المستخدم', secret: false, required: true, kind: 'text', showWhen: { key: 'authMode', value: 'basic' } },
    { key: 'password', en: 'Password', ar: 'كلمة المرور', secret: true, required: true, kind: 'text', showWhen: { key: 'authMode', value: 'basic' } },
    { key: 'tokenUrl', en: 'Token URL', ar: 'رابط الرمز', secret: false, required: true, kind: 'url', placeholder: 'https://idcs-xxxx.identity.oraclecloud.com/oauth2/v1/token', showWhen: { key: 'authMode', value: 'oauth' } },
    { key: 'clientId', en: 'Client ID', ar: 'معرّف العميل', secret: false, required: true, kind: 'text', showWhen: { key: 'authMode', value: 'oauth' } },
    { key: 'clientSecret', en: 'Client secret', ar: 'سر العميل', secret: true, required: true, kind: 'text', showWhen: { key: 'authMode', value: 'oauth' } },
    { key: 'scope', en: 'Scope', ar: 'النطاق', secret: false, required: true, kind: 'text', showWhen: { key: 'authMode', value: 'oauth' } },
    { key: 'procurementBU', en: 'Procurement business unit', ar: 'وحدة أعمال المشتريات', secret: false, required: false, kind: 'text' },
    { key: 'supplierSite', en: 'Default supplier site', ar: 'موقع المورد الافتراضي', secret: false, required: false, kind: 'text' },
    { key: 'buyerEmail', en: 'Buyer email (POs)', ar: 'بريد المشتري (أوامر الشراء)', secret: false, required: false, kind: 'text' },
    { key: 'categoryName', en: 'Purchasing category (PO lines)', ar: 'فئة الشراء (بنود أوامر الشراء)', secret: false, required: false, kind: 'text' },
    { key: 'currencyCode', en: 'Currency code', ar: 'رمز العملة', secret: false, required: false, kind: 'text', pattern: /^[A-Z]{3}$/, patternHint: 'ISO code e.g. SAR', defaultValue: 'SAR' },
  ],
}

/** A field is in play when it has no showWhen, or its condition matches the config. */
export function fieldApplies(f: FieldSpec, config: Record<string, unknown>): boolean {
  if (!f.showWhen) return true
  return (config[f.showWhen.key] ?? '') === f.showWhen.value
}

export function secretKeys(provider: ConnectorProvider): string[] {
  return PROVIDER_FIELDS[provider].filter(f => f.secret).map(f => f.key)
}

/**
 * Validate and clean the NON-secret config. Unknown keys and secret keys are
 * dropped — a secret can never land in erp_connections.config even if a client
 * sends it there. URL fields are shape-checked here (https, parseable); the DNS
 * level SSRF check is done server-side by ssrf.ts.
 */
export function validateConfig(
  provider: ConnectorProvider,
  raw: unknown,
): { ok: true; config: Record<string, string> } | { ok: false; errors: string[] } {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: Record<string, string> = {}
  const errors: string[] = []
  // Fill defaults first so showWhen sees e.g. authMode=basic.
  for (const f of PROVIDER_FIELDS[provider]) {
    if (f.secret) continue
    const v = typeof input[f.key] === 'string' || typeof input[f.key] === 'number' ? String(input[f.key]).trim() : ''
    const val = v || f.defaultValue || ''
    if (val) out[f.key] = val
  }
  for (const f of PROVIDER_FIELDS[provider]) {
    if (f.secret || !fieldApplies(f, out)) { if (!f.secret) delete out[f.key]; continue }
    const val = out[f.key] ?? ''
    if (!val) { if (f.required) errors.push(`${f.en} is required`); continue }
    if (val.length > 500) { errors.push(`${f.en} is too long`); continue }
    if (f.kind === 'url') {
      let u: URL | null = null
      try { u = new URL(val) } catch { u = null }
      if (!u || u.protocol !== 'https:') { errors.push(`${f.en} must be an https URL`); continue }
      if (u.username || u.password) { errors.push(`${f.en} must not contain credentials`); continue }
      out[f.key] = val.replace(/\/+$/, '')
    }
    if (f.kind === 'select' && f.options && !f.options.some(o => o.value === val)) {
      errors.push(`${f.en} has an invalid value`); continue
    }
    if (f.pattern && !f.pattern.test(val)) errors.push(`${f.en} must be ${f.patternHint ?? 'valid'}`)
  }
  return errors.length ? { ok: false, errors } : { ok: true, config: out }
}

/** Secret fields that apply to this config but have no stored value. */
export function missingSecrets(
  provider: ConnectorProvider,
  config: Record<string, unknown>,
  secrets: Record<string, string>,
): string[] {
  return PROVIDER_FIELDS[provider]
    .filter(f => f.secret && f.required && fieldApplies(f, config) && !secrets[f.key])
    .map(f => f.key)
}
