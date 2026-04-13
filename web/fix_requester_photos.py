with open('src/app/request/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add photos state
old_state = """  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    site_id: '',
    priority: 'medium',
    requester_name: '',
    requester_phone: '',
  })"""

new_state = """  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    site_id: '',
    priority: 'medium',
    requester_name: '',
    requester_phone: '',
  })
  const [photos, setPhotos] = useState<File[]>([])
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)"""

content = content.replace(old_state, new_state)

# Add photo upload function before handleSubmit
old_submit = "  async function handleSubmit(e: React.FormEvent) {"
new_submit = """  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const combined = [...photos, ...files].slice(0, 5)
    setPhotos(combined)
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  async function uploadPhotos(): Promise<string[]> {
    if (photos.length === 0) return []
    setUploadingPhotos(true)
    const urls: string[] = []
    for (const photo of photos) {
      const ext = photo.name.split('.').pop()
      const path = 'requests/' + profile.organisation_id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext
      const { error } = await supabase.storage.from('media').upload(path, photo, { cacheControl: '3600', upsert: false })
      if (!error) {
        const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
        urls.push(urlData.publicUrl)
      }
    }
    setUploadingPhotos(false)
    return urls
  }

  async function handleSubmit(e: React.FormEvent) {"""

content = content.replace(old_submit, new_submit)

# Upload photos before insert and add photo_urls to insert
old_insert = """    const { error: insertError } = await supabase.from('work_orders').insert({
      title: form.title,
      description: form.description,
      location_notes: form.location,
      site_id: form.site_id || null,
      priority: form.priority,
      status: 'new',
      source: 'requester',
      organisation_id: profile.organisation_id,
      created_by: user.id,
      requester_name: form.requester_name,
      requester_phone: form.requester_phone || null,
    })"""

new_insert = """    const uploadedUrls = await uploadPhotos()

    const { error: insertError } = await supabase.from('work_orders').insert({
      title: form.title,
      description: form.description,
      location_notes: form.location,
      site_id: form.site_id || null,
      priority: form.priority,
      status: 'new',
      source: 'requester',
      organisation_id: profile.organisation_id,
      created_by: user.id,
      requester_name: form.requester_name,
      requester_phone: form.requester_phone || null,
      photo_urls: uploadedUrls.length > 0 ? uploadedUrls : null,
    })"""

content = content.replace(old_insert, new_insert)

# Add photo upload UI before the error div and submit button
old_priority_end = """            </div>
            </div>

            {error && ("""

new_priority_end = """            </div>
            </div>

            <div>
              <label style={labelStyle}>Photos (optional — max 5)</label>
              <div style={{ border: '2px dashed #ddd', borderRadius: 10, padding: '1rem', textAlign: 'center' as const }}>
                <input
                  type='file'
                  accept='image/*'
                  multiple
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                  id='photo-upload'
                />
                <label htmlFor='photo-upload' style={{ cursor: 'pointer', fontSize: 13, color: '#666' }}>
                  <span style={{ fontSize: 24, display: 'block', marginBottom: 4 }}>📷</span>
                  Tap to add photos of the issue
                  <span style={{ display: 'block', fontSize: 12, color: '#bbb', marginTop: 2 }}>Up to 5 images</span>
                </label>
              </div>
              {photos.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {photos.map((photo, i) => (
                    <div key={i} style={{ position: 'relative' as const }}>
                      <img
                        src={URL.createObjectURL(photo)}
                        alt={'Photo ' + (i + 1)}
                        style={{ width: 80, height: 80, objectFit: 'cover' as const, borderRadius: 8, border: '1px solid #ddd' }}
                      />
                      <button
                        type='button'
                        onClick={() => removePhoto(i)}
                        style={{ position: 'absolute' as const, top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c62828', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && ("""

content = content.replace(old_priority_end, new_priority_end)

# Update submit button text to show uploading state
content = content.replace(
    "{loading ? 'Submitting...' : 'Submit Request'}",
    "{loading ? (uploadingPhotos ? 'Uploading photos...' : 'Submitting...') : 'Submit Request'}"
)

# Reset photos on success
content = content.replace(
    "setForm({ title: '', description: '', location: '', site_id: '', priority: 'medium', requester_name: profile?.full_name ?? '', requester_phone: '' })",
    "setForm({ title: '', description: '', location: '', site_id: '', priority: 'medium', requester_name: profile?.full_name ?? '', requester_phone: '' }); setPhotos([])"
)

with open('src/app/request/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Photo upload added to requester portal')