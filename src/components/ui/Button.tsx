import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 shadow-sm',
  secondary: 'bg-white text-ink border border-slate-200 hover:bg-slate-50 shadow-sm',
  ghost: 'text-ink-soft hover:bg-slate-100 hover:text-ink',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2' };

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', icon, className = '', children, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} {...rest}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}>
      {icon}{children}
    </button>
  );
});

export function IconButton({ label, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-slate-100 hover:text-ink disabled:opacity-40 ${className}`}>
      {children}
    </button>
  );
}
