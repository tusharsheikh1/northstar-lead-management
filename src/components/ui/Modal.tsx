import { useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button, IconButton } from './Button';

interface ModalProps { title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' | 'xl' }

export function Modal({ title, description, onClose, children, footer, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);
  const width = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-navy-900/40" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full ${width} flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-slate-50/60 px-5 py-3 sm:rounded-b-2xl sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onClose }: { title: string; message: ReactNode; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <Button onClick={onClose} data-autofocus>Cancel</Button>
        <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </>}>
      <div className="text-sm text-ink-soft">{message}</div>
    </Modal>
  );
}
