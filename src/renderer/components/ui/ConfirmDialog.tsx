import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Button, { type ButtonProps } from './Button';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ButtonProps['variant'];
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancel', variant = 'danger', busy = false, onConfirm, onCancel, children }: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ busy, onCancel, variant });
  callbacks.current = { busy, onCancel, variant };

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const initialFocus = () => {
      const selector = callbacks.current.variant === 'danger' ? '[data-dialog-cancel]' : '[data-dialog-confirm]';
      const target = dialog.querySelector<HTMLButtonElement>(selector);
      if (target && !target.disabled) target.focus();
      else dialog.focus();
    };
    const focusableControls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]',
    )).filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert]')
      && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
      .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!callbacks.current.busy) callbacks.current.onCancel();
      }
      if (event.key !== 'Tab') return;
      const controls = focusableControls();
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) initialFocus();
    };
    initialFocus();
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(<div className="dialog-overlay">
    <div className="confirm-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy || undefined} tabIndex={-1}>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId} className="dialog-description">{description}</p>
      {children && <div className="dialog-body">{children}</div>}
      <div className="dialog-actions">
        <Button variant="secondary" data-dialog-cancel disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={variant} data-dialog-confirm busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  </div>, document.body);
}

export default ConfirmDialog;
