import { cloneElement, type ReactElement, type ReactNode } from 'react';

type ControlProps = { id?: string; required?: boolean; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' };
export type FieldProps = { label: string; htmlFor: string; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactElement<ControlProps> };

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;
  const describedBy = [children.props['aria-describedby'], hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(' ');
  const control = cloneElement(children, {
    id: htmlFor,
    required: required ?? children.props.required,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': error ? true : children.props['aria-invalid'],
  });
  return <div className="form-field ui-field">
    <label htmlFor={htmlFor}>{label}{required && <span className="required-hint">Required</span>}</label>
    {control}
    {hint && <p id={hintId} className="field-hint">{hint}</p>}
    {error && <p id={errorId} className="field-error" role="alert">{error}</p>}
  </div>;
}

export default Field;
