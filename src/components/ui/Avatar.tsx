import type { Owner } from '../../types';
import { initials } from '../../lib/format';

const TINTS = ['#dbe4ff', '#d3f2e3', '#fde8c8', '#eadcfb', '#ffe0e0', '#d6f1f7'];
const INKS = ['#2b45a0', '#0b6b44', '#92520a', '#6b2fb4', '#a12a2a', '#0e6a7d'];

function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

export function Avatar({ name, owner, size = 32, className = '' }: { name?: string; owner?: Owner; size?: number; className?: string }) {
  const n = owner?.name ?? name ?? '?';
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  if (owner?.photo) return <img src={owner.photo} alt="" style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
  const i = hash(n) % TINTS.length;
  return (
    <span aria-hidden style={{ ...style, background: owner ? `${owner.color}22` : TINTS[i], color: owner ? owner.color : INKS[i] }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}>
      {initials(n)}
    </span>
  );
}

const LOGO_COLORS = ['#e5484d', '#3e63dd', '#101828', '#0090ff', '#30a46c', '#8e4ec6', '#f76b15', '#12a594'];
export function CompanyLogo({ name, size = 28 }: { name: string; size?: number }) {
  const c = LOGO_COLORS[hash(name) % LOGO_COLORS.length];
  return (
    <span aria-hidden style={{ width: size, height: size, background: c, fontSize: size * 0.45 }}
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-bold text-white">
      {name[0]?.toUpperCase()}
    </span>
  );
}
