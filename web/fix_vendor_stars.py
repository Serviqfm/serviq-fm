with open('src/app/dashboard/vendors/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix empty star character in button
old_star = """              <button key={star} onClick={() => saveRating(star)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: star <= rating ? '#f57f17' : '#ddd', padding: 0 }}>
                
              </button>"""

new_star = """              <button key={star} onClick={() => saveRating(star)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: star <= rating ? '#f57f17' : '#ddd', padding: 0 }}>
                {star <= rating ? '\u2605' : '\u2606'}
              </button>"""

if old_star in content:
    content = content.replace(old_star, new_star)
    print('Star characters fixed')
else:
    # Try finding the button and replacing inline
    idx = content.find('saveRating(star)')
    print('Context:', repr(content[idx-50:idx+200]))
    print('Pattern not found - manual fix needed')

with open('src/app/dashboard/vendors/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')