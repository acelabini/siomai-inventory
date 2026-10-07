import type { ButtonHTMLAttributes } from 'react';
import AppIcon, { type IconName } from './AppIcon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  busy?: boolean;
}

export function Button({ variant, icon, busy = false, disabled, children, className = '', type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={`ui-button ui-button-${variant} ${className}`.trim()}
    disabled={disabled || busy} aria-busy={busy || undefined}>
    {(busy || icon) && <AppIcon name={busy ? 'loading' : icon!} />}
    {children}
  </button>;
}

export default Button;
