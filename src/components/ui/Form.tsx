import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

interface FieldProps { label: string; error?: string; hint?: string; required?: boolean; children: (p: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode; className?: string }

export function Field({ label, error, hint, required, children, className = '' }: FieldProps) {
  const id = useId();
  const descId = error || hint ? `${id}-d` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}{required && <span className="text-red-500" aria-hidden> *</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': descId })}
      {error ? <p id={descId} role="alert" className="mt-1 text-xs text-red-600">{error}</p>
        : hint ? <p id={descId} className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export const Input = ({ className = '', invalid, ...p }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) =>
  <input {...p} className={`input ${invalid ? 'input-error' : ''} ${className}`} />;

export const Textarea = ({ className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) =>
  <textarea {...p} className={`input resize-y ${className}`} />;

export function Select({ className = '', children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...p} className={`input appearance-none pr-9 ${className}`}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
    </div>
  );
}

/** Compact select with a leading icon, used for toolbar filters. */
export function ToolbarSelect({ icon, label, className = '', children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode; label: string }) {
  return (
    <div className={`relative ${className}`}>
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft">{icon}</span>}
      <select aria-label={label} {...p}
        className={`h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pr-9 text-sm font-medium text-ink shadow-sm hover:bg-slate-50 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 ${icon ? 'pl-10' : 'pl-3'}`}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
    </div>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
        {description && <p className="text-[13px] text-ink-soft">{description}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-slate-300'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
