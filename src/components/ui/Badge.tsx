import type { ReactNode } from 'react';

export const STAGE_COLORS: Record<string, string> = {
  New: '#2f5fe0', Contacted: '#38bdf8', Qualified: '#4db3ff', Proposal: '#8b5cf6', Negotiation: '#f5b82e', Won: '#1fa971', Lost: '#ef4444',
};

const tones: Record<string, string> = {
  New: 'bg-blue-50 text-blue-700', Contacted: 'bg-sky-50 text-sky-700', Qualified: 'bg-emerald-50 text-emerald-700',
  Proposal: 'bg-violet-50 text-violet-700', Negotiation: 'bg-amber-50 text-amber-700', Won: 'bg-green-100 text-green-800', Lost: 'bg-red-50 text-red-700',
  High: 'bg-red-50 text-red-700', Medium: 'bg-amber-50 text-amber-700', Low: 'bg-green-50 text-green-700',
  Overdue: 'bg-red-50 text-red-700', neutral: 'bg-slate-100 text-slate-600', success: 'bg-emerald-50 text-emerald-700', warning: 'bg-amber-50 text-amber-700', info: 'bg-primary-50 text-primary-700',
};

export function Badge({ tone, children, className = '' }: { tone: string; children?: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.neutral} ${className}`}>
      {children ?? tone}
    </span>
  );
}
