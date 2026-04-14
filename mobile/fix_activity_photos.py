with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add activity tab to tabs array
old_tabs = """  const tabs = [
    { key: 'details',  label: lang === 'ar' ? 'التفاصيل' : 'Details' },
    { key: 'comments', label: lang === 'ar' ? 'التعليقات' : 'Comments', count: comments.length },
    { key: 'photos',   label: lang === 'ar' ? 'الصور' : 'Photos', count: photos.length },
    { key: 'time',     label: lang === 'ar' ? 'الوقت' : 'Time', count: timeLogs.length },
  ]"""

new_tabs = """  const tabs = [
    { key: 'details',  label: lang === 'ar' ? 'التفاصيل' : 'Details' },
    { key: 'comments', label: lang === 'ar' ? 'التعليقات' : 'Comments', count: comments.length },
    { key: 'photos',   label: lang === 'ar' ? 'الصور' : 'Photos', count: photos.length },
    { key: 'time',     label: lang === 'ar' ? 'الوقت' : 'Time', count: timeLogs.length },
    { key: 'activity', label: lang === 'ar' ? 'النشاط' : 'Activity', count: allComments.length },
  ]"""

content = content.replace(old_tabs, new_tabs)

# Add activity tab type
content = content.replace(
    "const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'photos' | 'time'>('details')",
    "const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'photos' | 'time' | 'activity'>('details')"
)

# Add activity tab content before closing ScrollView
old_close_scroll = """      </ScrollView>

      {zoomPhoto && ("""
new_close_scroll = """
        {activeTab === 'activity' && (
          <View style={styles.card}>
            <Text style={[styles.rowLabel, { marginBottom: 12 }]}>
              {lang === 'ar' ? 'سجل النشاط الكامل' : 'Full Activity Log'}
            </Text>
            {allComments.length === 0
              ? <Text style={styles.empty}>{lang === 'ar' ? 'لا يوجد نشاط بعد' : 'No activity yet'}</Text>
              : [...allComments].reverse().map(c => {
                const isStatus = c.comment_type === 'status_change'
                const isTime = c.comment_type === 'time_log'
                const isComment = !c.comment_type || c.comment_type === 'comment'
                const icon = isStatus ? 'swap-horizontal-outline' : isTime ? 'time-outline' : 'chatbubble-outline'
                const iconColor = isStatus ? colors.warning : isTime ? colors.info : colors.primary
                return (
                  <View key={c.id} style={styles.activityRow}>
                    <View style={[styles.activityIcon, { backgroundColor: iconColor + '20' }]}>
                      <Ionicons name={icon as any} size={14} color={iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityText}>{c.body}</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                        <Text style={styles.commentTime}>{c.author?.full_name ?? 'System'}</Text>
                        <Text style={styles.commentTime}>{format(new Date(c.created_at), 'dd MMM HH:mm')}</Text>
                      </View>
                    </View>
                  </View>
                )
              })
            }
          </View>
        )}

      </ScrollView>

      {zoomPhoto && ("""

content = content.replace(old_close_scroll, new_close_scroll)

# Add activity styles
old_styles_end = """  timeLogText: { fontSize: 13, color: colors.text },
})"""
new_styles_end = """  timeLogText: { fontSize: 13, color: colors.text },
  activityRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'flex-start' },
  activityIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  activityText: { fontSize: 13, color: colors.text, lineHeight: 18 },
})"""

content = content.replace(old_styles_end, new_styles_end)

# Fix photo loading speed - use smaller thumbnails
# Photos are full size public URLs - add size hint
content = content.replace(
    "<Image source={{ uri: url }} style={styles.photo} />",
    "<Image source={{ uri: url }} style={styles.photo} resizeMode='cover' />"
)

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Activity tab added and photos optimized')