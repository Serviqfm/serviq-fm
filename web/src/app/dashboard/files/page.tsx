'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

interface FileRow {
  id: string; name: string; url: string; mime: string | null; size_bytes: number | null
  created_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uploader?: any
  attachment_count: number
}

const ACCEPT = 'image/*,application/pdf,video/mp4,video/quicktime'

function humanSize(b: number | null): string {
  if (!b) return '—'
  const kb = b / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}
function shortType(m: string | null): string {
  if (!m) return '—'
  if (m.startsWith('image/')) return 'Image'
  if (m.startsWith('video/')) return 'Video'
  if (m === 'application/pdf') return 'PDF'
  return m
}

export default function FilesPage() {
  const supabase = createClient()
  const { lang } = useLanguage()
  const [files, setFiles] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    const [{ data: fileData }, { data: attach }] = await Promise.all([
      supabase.from('files').select('id, name, url, mime, size_bytes, created_at, uploader:uploaded_by(full_name)')
        .eq('organisation_id', profile.organisation_id).order('created_at', { ascending: false }).limit(500),
      supabase.from('file_attachments').select('file_id').eq('organisation_id', profile.organisation_id),
    ])
    const counts = new Map<string, number>()
    for (const a of attach ?? []) counts.set(a.file_id, (counts.get(a.file_id) ?? 0) + 1)
    setFiles((fileData ?? []).map((f: Omit<FileRow, 'attachment_count'>) => ({ ...f, attachment_count: counts.get(f.id) ?? 0 })))
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !orgId) return
    setError(''); setUploading(true)
    const fd = new FormData(); fd.append('file', file)
    const params = new URLSearchParams({ bucket: 'work-order-media', prefix: `${orgId}/files` })
    const res = await fetch(`/api/upload?${params}`, { method: 'POST', body: fd })
    if (inputRef.current) inputRef.current.value = ''
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? (lang === 'ar' ? 'فشل الرفع' : 'Upload failed')); setUploading(false); return
    }
    const { publicUrl } = await res.json()
    const { data: { user } } = await supabase.auth.getUser()
    const { error: fErr } = await supabase.from('files').insert({
      organisation_id: orgId, name: file.name, url: publicUrl, mime: file.type || null, size_bytes: file.size, uploaded_by: user?.id ?? null,
    })
    setUploading(false)
    if (fErr) { setError(fErr.message); return }
    await load()
  }

  async function remove(f: FileRow) {
    const msg = f.attachment_count > 0
      ? (lang === 'ar' ? `حذف "${f.name}"؟ سيُزال من ${f.attachment_count} عنصر مرتبط.` : `Delete "${f.name}"? It will be removed from ${f.attachment_count} attached item(s).`)
      : (lang === 'ar' ? `حذف "${f.name}"؟` : `Delete "${f.name}"?`)
    if (!confirm(msg)) return
    // Server route removes the storage object too (no orphaned blobs) + the DB row.
    const res = await fetch(`/api/files/${f.id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Delete failed'); return }
    await load()
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1100px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{lang === 'ar' ? 'الملفات' : 'Files'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{lang === 'ar' ? 'مكتبة ملفات المؤسسة — أرفقها بأوامر العمل.' : 'Your organisation’s file library — attach files to work orders.'}</p>
          </div>
          <label className={`bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm cursor-pointer hover:bg-primary/90 transition-colors flex items-center gap-2 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <span className="material-symbols-outlined text-lg">upload</span>
            {uploading ? (lang === 'ar' ? 'جارٍ الرفع...' : 'Uploading...') : (lang === 'ar' ? 'رفع ملف' : 'Upload File')}
            <input ref={inputRef} type="file" accept={ACCEPT} onChange={handleUpload} className="hidden" />
          </label>
        </div>

        {error && <p className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3 py-2">{error}</p>}

        {loading ? (
          <div className="text-on-surface-variant py-8 text-center">Loading...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">folder</span>
            <p className="text-lg font-semibold mb-1">{lang === 'ar' ? 'لا توجد ملفات بعد' : 'No files yet'}</p>
            <p className="text-sm">{lang === 'ar' ? 'ارفع ملفاً أو أرفق ملفات من تبويب الملفات في أمر العمل.' : 'Upload a file here, or attach files from a work order’s Files tab.'}</p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30">
                  {[lang === 'ar' ? 'الاسم' : 'Name', lang === 'ar' ? 'النوع' : 'Type', lang === 'ar' ? 'الحجم' : 'Size', lang === 'ar' ? 'مرفق بـ' : 'Attached to', lang === 'ar' ? 'رُفع' : 'Uploaded', ''].map((h, i) => (
                    <th key={i} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {files.map(f => (
                  <tr key={f.id} className="transition-colors hover:bg-surface-container-low">
                    <td className="p-3"><a href={f.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">{f.name}</a></td>
                    <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{shortType(f.mime)}</td>
                    <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{humanSize(f.size_bytes)}</td>
                    <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{f.attachment_count} {lang === 'ar' ? 'عنصر' : 'item(s)'}</td>
                    <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{f.created_at ? new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td className="p-3 whitespace-nowrap text-right">
                      <button onClick={() => remove(f)} className="text-xs px-2.5 py-1 border border-outline-variant rounded-lg cursor-pointer text-error hover:bg-error/10 bg-surface transition-colors">{lang === 'ar' ? 'حذف' : 'Delete'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
