export default function PriorityBadge({ priority }: { priority: string }) {
    const config: Record<string, { label: string; bg: string; color: string }> = {
      low:      { label: 'Low',      bg: '#e8f5e9', color: '#2e7d32' },
      medium:   { label: 'Medium',   bg: '#fff8e1', color: '#f57f17' },
      high:     { label: 'High',     bg: '#fff3e0', color: '#e65100' },
      critical: { label: 'Critical', bg: '#fce4ec', color: '#b71c1c' },
    }
    const { label, bg, color } = config[priority] ?? config.medium
    return (
      <span style={{ background: bg, color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
        {label}
      </span>
    )
  }