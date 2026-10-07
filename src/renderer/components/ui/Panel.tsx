import { useId, type ReactNode } from 'react';

export type PanelProps = { title?: string; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string };

export function Panel({ title, meta, actions, children, className = '' }: PanelProps) {
  const titleId = useId();
  return <section className={`ui-panel ${className}`.trim()} aria-labelledby={title ? titleId : undefined}>
    {(title || meta || actions) && <header className="panel-header">
      <div>{title && <h2 id={titleId}>{title}</h2>}{meta && <p className="panel-meta">{meta}</p>}</div>
      {actions && <div className="panel-actions">{actions}</div>}
    </header>}
    <div className="panel-body">{children}</div>
  </section>;
}

export default Panel;
