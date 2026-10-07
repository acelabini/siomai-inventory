import type { ReactNode } from 'react';

export type PageHeaderProps = { eyebrow: string; title: string; description?: ReactNode; actions?: ReactNode; titleId: string };

export function PageHeader({ eyebrow, title, description, actions, titleId }: PageHeaderProps) {
  return <header className="page-header">
    <div className="page-header-copy">
      <p className="eyebrow">{eyebrow}</p>
      <h1 id={titleId}>{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>;
}

export default PageHeader;
