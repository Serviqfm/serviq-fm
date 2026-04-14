with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove organisation_id from all comment inserts
content = content.replace(
    "      comment_type: 'comment',\n      organisation_id: profile?.organisation_id,",
    "      comment_type: 'comment',"
)
content = content.replace(
    "      comment_type: 'status_change',\n      organisation_id: profile?.organisation_id,",
    "      comment_type: 'status_change',"
)
content = content.replace(
    "      comment_type: 'time_log',\n      organisation_id: profile?.organisation_id,",
    "      comment_type: 'time_log',"
)

# Also catch any remaining organisation_id in comment inserts
import re
content = re.sub(
    r"(work_order_id: wo\.id,\n\s+user_id: profile\?\.id,\n\s+body: [^\n]+,\n\s+comment_type: [^\n]+,)\n\s+organisation_id: profile\?\.organisation_id,",
    r"\1",
    content
)

print('organisation_id removed from inserts')
print('Remaining organisation_id refs:', content.count('organisation_id'))

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved')