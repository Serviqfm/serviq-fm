'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

interface FileRow { id: string; name: string; url: string; mime: string | null; size_bytes: number | null; created_at: string }
interface AttachedFile extends FileRow { attachment_id: string }

const ACCEPT = 'image/*,application/pdf,video/mp4,video/quicktime'

function humanSize(b: number | null): string {
  if (!b) return ''
  const kb = b / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}
const isImage = (m: string | null) => !!m && m.startsWith('image/')
const isVideo = (m: string | null) => !!m && m.startsWith('video/')

export default function WorkOrderFilesTab({ woId, orgId }: { woId: string; orgId: string }) {
  const supabase = createClient()
  const { lang } = useLanguage()
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [orgFiles, setOrgFiles] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [woId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('file_attachments')
      .select('id, file:file_id(id, name, url, mime, size_bytes, created_at)')
      .eq('entity_type', 'work_order')
      .eq('entity_id', woId)
      .order('created_at', { ascending: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []).map((a: any) => a.file ? { ...a.file, attachment_id: a.id } : null).filter(Boolean) as AttachedFile[]
    setFiles(rows)
    setLoading(false)
  }

  async function loadOrgFiles() {
    const attachedIds = new Set(files.map(f => f.id))
    const { data } = await supabase
      .from('files').select('id, name, url, mime, size_bytes, created_at')
      .eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(200)
    setOrgFiles((data ?? []).filter((f: FileRow) => !attachedIds.has(f.id)))
    setShowAttach(true)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setUploading(true)
    const fd = new FormData(); fd.append('file', file)
    const params = new URLSearchParams({ bucket: 'work-order-media', prefix: `${orgId}/${woId}` })
    const res = await fetch(`/api/upload?${params}`, { method: 'POST', body: fd })
    if (inputRef.current) inputRef.current.value = ''
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? (lang === 'ar' ? 'فشل الرفع' : 'Upload failed')); setUploading(false); return
    }
    const { publicUrl } = await res.json()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: fileRow, error: fErr } = await supabase.from('files').insert({
      organisation_id: orgId, name: file.name, url: publicUrl, mime: file.type || null, size_bytes: file.size, uploaded_by: user?.id ?? null,
    }).select('id').single()
    if (fErr || !fileRow) { setError(fErr?.message ?? 'Failed to save file'); setUploading(false); return }
    await supabase.from('file_attachments').insert({ organisation_id: orgId, file_id: fileRow.id, entity_type: 'work_order', entity_id: woId })
    setUploading(false)
    await load()
  }

  async function attachExisting(fileId: string) {
    await supabase.from('file_attachments').insert({ organisation_id: orgId, file_id: fileId, entity_type: 'work_order', entity_id: woId })
    setShowAttach(false)
    await load()
  }

  async function detach(attachmentId: string) {
    if (!confirm(lang === 'ar' ? 'إزالة هذا الملف من أمر العمل؟ (يبقى في مكتبة الملفات)' : 'Remove this file from the work order? (it stays in the Files library)')) return
    await supabase.from('file_attachments').delete().eq('id', attachmentId)
    await load()
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <label className={`bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm cursor-pointer hover:bg-primary/90 transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
          {uploading ? (lang === 'ar' ? 'جارٍ الرفع...' : 'Uploading...') : (lang === 'ar' ? 'رفع ملف' : 'Upload File')}
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={handleUpload} className="hidden" />
        </label>
        <button onClick={loadOrgFiles}
          className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">
          {lang === 'ar' ? 'إرفاق ملف موجود' : 'Attach Existing'}
        </button>
      </div>

      {error && <p className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {showAttach && (
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-3 mb-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-semibold text-on-surface m-0">{lang === 'ar' ? 'اختر ملفاً من المكتبة' : 'Pick a file from the library'}</p>
            <button onClick={() => setShowAttach(false)} className="text-xs text-on-surface-variant hover:text-primary">✕</button>
          </div>
          {orgFiles.length === 0 ? (
            <p className="text-sm text-on-surface-variant m-0">{lang === 'ar' ? 'لا توجد ملفات أخرى.' : 'No other files available.'}</p>
          ) : (
            <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
              {orgFiles.map(f => (
                <button key={f.id} onClick={() => attachExisting(f.id)}
                  className="text-left text-sm px-3 py-2 rounded-lg hover:bg-surface-container transition-colors flex justify-between items-center gap-3">
                  <span className="truncate text-on-surface">{f.name}</span>
                  <span className="text-xs text-on-surface-variant flex-shrink-0">{humanSize(f.size_bytes)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading...</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{lang === 'ar' ? 'لا توجد ملفات مرفقة بعد.' : 'No files attached yet.'}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {files.map(f => (
            <div key={f.attachment_id} className="border border-outline-variant rounded-xl overflow-hidden bg-surface-container-lowest">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="block">
                {isImage(f.mime) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.name} className="w-full h-28 object-cover" />
                ) : isVideo(f.mime) ? (
                  <video src={f.url} className="w-full h-28 object-cover bg-black" />
                ) : (
                  <div className="w-full h-28 flex items-center justify-center bg-surface-container">
                    <span className="material-symbols-outlined text-4xl text-outline-variant">description</span>
                  </div>
                )}
              </a>
              <div className="p-2">
                <p className="text-xs font-medium text-on-surface truncate m-0" title={f.name}>{f.name}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[11px] text-on-surface-variant">{humanSize(f.size_bytes)}</span>
                  <button onClick={() => detach(f.attachment_id)} className="text-[11px] text-error hover:underline">{lang === 'ar' ? 'إزالة' : 'Remove'}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
