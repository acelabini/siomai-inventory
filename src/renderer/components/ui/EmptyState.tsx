import { useId, type ReactNode } from 'react';
import AppIcon, { type IconName } from './AppIcon';

export type EmptyStateProps = { icon: IconName; title: string; description: string; actions?: ReactNode };

export function EmptyState({ icon, title, description, actions }: EmptyStateProps) {
  const titleId = useId();
  return <section className="empty-state" aria-labelledby={titleId}>
    <span className="empty-state-icon"><AppIcon name={icon} size={28} /></span>
    <h2 id={titleId}>{title}</h2>
    <p>{description}</p>
    {actions && <div className="empty-state-actions">{actions}</div>}
  </section>;
}

export default EmptyState;
