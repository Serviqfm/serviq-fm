with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Comments not showing - remove comment_type filter so all comments show
old_all_comments = "  const allComments = comments.filter(c => !c.comment_type || c.comment_type === 'comment' || c.comment_type === 'status_change')"
new_all_comments = "  const allComments = comments"
content = content.replace(old_all_comments, new_all_comments)

# Fix 2: Time logs not showing - fetch ALL comments then filter client-side
old_time_filter = """    // Load time logs from comments with type 'time_log'
    const { data: logs } = await supabase
      .from('work_order_comments')
      .select('*, author:user_id(full_name)')
      .eq('work_order_id', route.params.id)
      .eq('comment_type', 'time_log')
      .order('created_at', { ascending: false })
    if (logs) setTimeLogs(logs)"""

new_time_filter = """    // Time logs are filtered from comments client-side
    setTimeLogs([])"""

content = content.replace(old_time_filter, new_time_filter)

# Fix 3: Filter time logs from fetched comments
old_set_comments = "    if (cmts) setComments(cmts)"
new_set_comments = """    if (cmts) {
      setComments(cmts)
      setTimeLogs(cmts.filter((c: any) => c.comment_type === 'time_log'))
    }"""

content = content.replace(old_set_comments, new_set_comments)

# Fix 4: Text string rendering error - fontVariant not supported in RN
content = content.replace(
    "fontVariant: ['tabular-nums']",
    ""
)

# Fix 5: Fix photo upload to use correct bucket path
old_upload = """    const { error } = await supabase.storage
      .from('media')
      .upload('work-orders/' + filename, arrayBuffer, { contentType: 'image/jpeg' })

    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl('work-orders/' + filename)"""

new_upload = """    const { error } = await supabase.storage
      .from('media')
      .upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: true })

    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)"""

content = content.replace(old_upload, new_upload)

# Fix same for gallery upload
old_gallery = """    const { error } = await supabase.storage
      .from('media')
      .upload('work-orders/' + filename, arrayBuffer, { contentType: 'image/jpeg' })

    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl('work-orders/' + filename)"""

new_gallery = """    const { error } = await supabase.storage
      .from('media')
      .upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: true })

    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)"""

content = content.replace(old_gallery, new_gallery)

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('WorkOrderDetailScreen fixed')