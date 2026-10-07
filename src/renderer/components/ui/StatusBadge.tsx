import type { ReactNode } from 'react';
import AppIcon, { type IconName } from './AppIcon';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export type StatusBadgeProps = { tone: StatusTone; icon?: IconName; children: ReactNode };
const toneIcons: Record<StatusTone, IconName> = { success: 'success', warning: 'warning', danger: 'danger', neutral: 'info' };

export function StatusBadge({ tone, icon, children }: StatusBadgeProps) {
  return <span className={`status-badge status-badge-${tone}`}><AppIcon name={icon ?? toneIcons[tone]} size={14} />{children}</span>;
}

export default StatusBadge;
