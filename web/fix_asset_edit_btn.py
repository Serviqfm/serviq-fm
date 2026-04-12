with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = "style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Assets</a>"

new = """style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Assets</a>
      <a href={'/dashboard/assets/' + id + '/edit'}>
        <button style={{ padding: '6px 16px', borderRadius: 7, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>Edit Asset</button>
      </a>"""

if old in content:
    content = content.replace(old, new)
    with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Edit button added successfully')
else:
    print('Pattern not found')