import type { AriaRole, ReactNode } from 'react';
import AppIcon, { type IconName } from './AppIcon';
import type { StatusTone } from './StatusBadge';

export type InlineNoticeProps = { tone: StatusTone; title: string; children?: ReactNode; action?: ReactNode; role?: AriaRole };
const toneIcons: Record<StatusTone, IconName> = { success: 'success', warning: 'warning', danger: 'danger', neutral: 'info' };

export function InlineNotice({ tone, title, children, action, role }: InlineNoticeProps) {
  return <div className={`inline-notice inline-notice-${tone}`} role={role ?? (tone === 'danger' ? 'alert' : 'status')}>
    <AppIcon name={toneIcons[tone]} />
    <div className="notice-copy"><strong>{title}</strong>{children && <div className="notice-description">{children}</div>}</div>
    {action && <div className="notice-action">{action}</div>}
  </div>;
}

export default InlineNotice;
