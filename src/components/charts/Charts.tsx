import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import type { Formatter } from '../../lib/format';
import { STAGE_COLORS } from '../ui/Badge';

export const SOURCE_COLORS = ['#2f5fe0', '#4db3ff', '#8b5cf6', '#f5b82e', '#1fa971', '#ef6b8a', '#94a3b8'];
const axis = { fontSize: 12, fill: '#5b6580' };

export function RevenueTrendChart({ data, fmt }: { data: { label: string; revenue: number; target: number }[]; fmt: Formatter }) {
  return (
    <div role="img" aria-label="Revenue versus target over time">
      <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4169E1" stopOpacity={0.18} /><stop offset="100%" stopColor="#4169E1" stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid stroke="#e6e8f0" vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: '#e6e8f0' }} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmt.moneyCompact(v)} />
          <Tooltip formatter={(v: number, n: string) => [fmt.money(v), n]} contentStyle={{ borderRadius: 10, border: '1px solid #e6e8f0', fontSize: 13 }} />
                    <Area type="linear" dataKey="revenue" stroke="none" fill="url(#rev)" isAnimationActive={false} tooltipType="none" />
          <Line type="linear" dataKey="revenue" name="Actual revenue" stroke="#4169E1" strokeWidth={2.5} dot={{ r: 4, fill: '#fff', stroke: '#4169E1', strokeWidth: 2 }} isAnimationActive={false} />
          <Line type="linear" dataKey="target" name="Target revenue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-center gap-5 text-[13px] text-ink-soft">
        <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-primary-500" aria-hidden />Actual revenue</span>
        <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-slate-400" aria-hidden />Target revenue</span>
      </div>
    </div>
  );
}

export function DonutChart({ data, center, sub, onSelect }: { data: { name: string; value: number }[]; center: string; sub: string; onSelect?: (name: string) => void }) {
  return (
    <div className="relative h-[210px] w-[210px] shrink-0" role="img" aria-label={`Lead sources: ${data.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={66} outerRadius={100} paddingAngle={1} startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2} isAnimationActive={false}
            onClick={(d) => onSelect?.((d as { name: string }).name)} cursor={onSelect ? 'pointer' : undefined}>
            {data.map((d, i) => <Cell key={d.name} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6e8f0', fontSize: 13 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-bold">{center}</span><span className="text-[13px] text-ink-soft">{sub}</span></div>
    </div>
  );
}

export function SimpleBars({ data, dataKey, nameKey, color = '#4169E1', fmt, money = false, height = 240 }: { data: Record<string, string | number>[]; dataKey: string; nameKey: string; color?: string; fmt?: Formatter; money?: boolean; height?: number }) {
  return (
    <div style={{ height }} className="w-full" role="img" aria-label="Bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e6e8f0" vertical={false} />
          <XAxis dataKey={nameKey} tick={axis} tickLine={false} axisLine={{ stroke: '#e6e8f0' }} interval="preserveStartEnd" />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={money ? 56 : 32} allowDecimals={false} tickFormatter={(v) => (money && fmt ? fmt.moneyCompact(v) : String(v))} />
          <Tooltip cursor={{ fill: '#f1f4fb' }} formatter={(v: number) => (money && fmt ? fmt.money(v) : v)} contentStyle={{ borderRadius: 10, border: '1px solid #e6e8f0', fontSize: 13 }} />
          <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusBars({ data }: { data: { status: string; count: number }[] }) {
  return (
    <div style={{ height: Math.max(180, data.length * 38) }} className="w-full" role="img" aria-label="Lead status distribution">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="status" tick={axis} tickLine={false} axisLine={false} width={86} />
          <Tooltip cursor={{ fill: '#f1f4fb' }} contentStyle={{ borderRadius: 10, border: '1px solid #e6e8f0', fontSize: 13 }} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} isAnimationActive={false} label={{ position: 'right', fontSize: 12, fill: '#5b6580' }}>
            {data.map((d) => <Cell key={d.status} fill={STAGE_COLORS[d.status] ?? '#4169E1'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
