import { useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { IconButton } from './Button';

export function Drawer({ title, onClose, children, side = 'right', width = 'max-w-xl' }: { title: string; onClose: () => void; children: ReactNode; side?: 'left' | 'right'; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocusTrap(ref, onClose);
  return (
    <div className="no-print fixed inset-0 z-40">
      <div className="absolute inset-0 bg-navy-900/40" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}
        className={`absolute inset-y-0 ${side === 'right' ? 'right-0' : 'left-0'} flex w-full ${width} flex-col bg-white shadow-pop`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id={id} className="text-base font-semibold">{title}</h2>
          <IconButton label="Close panel" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
