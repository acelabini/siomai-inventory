import { useId } from 'react';

export type MetricCardProps = { label: string; value: string; detail?: string; comparison?: string; tone?: 'default' | 'warning' | 'positive' };

export default function MetricCard({ label, value, detail, comparison, tone = 'default' }: MetricCardProps) {
  const labelId = useId();
  return <article className={`metric-card${tone === 'default' ? '' : ` metric-${tone}`}`} aria-labelledby={labelId}>
    <p id={labelId}>{label}</p><strong>{value}</strong>{detail && <span>{detail}</span>}{comparison && <span className="metric-comparison">{comparison}</span>}
  </article>;
}
