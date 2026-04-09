with open('src/app/dashboard/work-orders/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = '<a href="/dashboard/work-orders" style={{ color: \'#999\', fontSize: 13, textDecoration: \'none\' }}>← Back to Work Orders</a>'

new = """<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/dashboard/work-orders" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Work Orders</a>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={'/dashboard/work-orders/' + id + '/edit'}>
            <button style={{ padding: '6px 16px', borderRadius: 7, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>Edit</button>
          </a>
          <button onClick={() => window.print()} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 13 }}>Export PDF</button>
        </div>
      </div>"""

if old in content:
    content = content.replace(old, new)
    with open('src/app/dashboard/work-orders/[id]/page.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: Edit and Export PDF buttons added')
else:
    print('Still not found - printing lines containing Back to Work Orders:')
    for i, line in enumerate(content.split('\n')):
        if 'Back to Work' in line:
            print(i, repr(line))
