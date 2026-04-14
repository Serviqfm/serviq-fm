with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix: the column is 'body' not 'comment'
content = content.replace(
    "comment: newComment.trim(),",
    "body: newComment.trim(),"
)
content = content.replace(
    "comment: 'Status changed to: ' + newStatus,",
    "body: 'Status changed to: ' + newStatus,"
)
content = content.replace(
    "comment: 'Time logged: ' + timeStr + ' by ' + (profile?.full_name ?? 'technician'),",
    "body: 'Time logged: ' + timeStr + ' by ' + (profile?.full_name ?? 'technician'),"
)

# Fix: display body not comment
content = content.replace(
    "{c.comment_type === 'status_change' ? '🔄 ' + c.comment : c.comment}",
    "{c.comment_type === 'status_change' ? '🔄 ' + c.body : c.body}"
)
content = content.replace(
    "<Text style={styles.timeLogText}>{log.comment}</Text>",
    "<Text style={styles.timeLogText}>{log.body}</Text>"
)

# Fix: fetch body in select
content = content.replace(
    ".select('*, author:user_id(full_name)')",
    ".select('id, body, comment_type, created_at, author:user_id(full_name)')"
)

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Comment column fixed: body instead of comment')

# Also fix the web dashboard work_order_comments references
import os
wo_detail_web = '../web/src/app/dashboard/work-orders/[id]/page.tsx'
if os.path.exists(wo_detail_web):
    with open(wo_detail_web, 'r', encoding='utf-8') as f:
        web = f.read()
    print('Web WO detail has comment:', 'comment:' in web)
    print('Web WO detail has body:', "'body'" in web)