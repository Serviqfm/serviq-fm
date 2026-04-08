export default function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    new:         { label: 'New',         bg: '#e3f2fd', color: '#0d47a1' },
    assigned:    { label: 'Assigned',    bg: '#e8eaf6', color: '#283593' },
    in_progress: { label: 'In Progress', bg: '#fff8e1', color: '#f57f17' },
    on_hold:     { label: 'On Hold',     bg: '#fce4ec', color: '#880e4f' },
    completed:   { label: 'Completed',   bg: '#e8f5e9', color: '#1b5e20' },
    closed:      { label: 'Closed',      bg: '#f5f5f5', color: '#424242' },
  }
  const { label, bg, color } = config[status] ?? config.new
  return (
    <span style={{ background: bg, color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
      {label}
    </span>
  )
}