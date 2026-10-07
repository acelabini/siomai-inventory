export default function MetricCard({ label, value, detail, tone = 'default' }: { label: string; value: string; detail?: string; tone?: 'default' | 'warning' }) {
  return <article className={`metric-card ${tone === 'warning' ? 'metric-warning' : ''}`}>
    <p>{label}</p><strong>{value}</strong>{detail && <span>{detail}</span>}
  </article>;
}
