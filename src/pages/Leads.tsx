import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Award, Database, Download, Filter as FilterIcon, Pencil, Plus, Search, Trash2, Upload, Users, X } from 'lucide-react';
import { LEAD_STATUSES, type Lead, type LeadStatus } from '../types';
import { useStore } from '../store/StoreContext';
import { useFormat } from '../hooks/useFormat';
import { useSources } from '../hooks/useSources';
import { downloadFile, toCsv } from '../lib/csv';
import { sum } from '../lib/metrics';
import { Button, IconButton } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar, CompanyLogo } from '../components/ui/Avatar';
import { ConfirmDialog } from '../components/ui/Modal';
import { Field, Input, Select, ToolbarSelect } from '../components/ui/Form';
import { EmptyState, PageHeader, Pagination, Popover, StatCard, Tabs, Card } from '../components/ui/Misc';
import { LeadFormModal } from '../components/leads/LeadFormModal';
import { LeadDrawer } from '../components/leads/LeadDrawer';
import { ImportModal } from '../components/leads/ImportModal';

type SortKey = 'name' | 'company' | 'status' | 'ownerId' | 'source' | 'lastActivityAt' | 'value' | 'createdAt';
const COLS: { key: SortKey; label: string; asc: string; desc: string; align?: 'right' }[] = [
  { key: 'name', label: 'Lead', asc: 'Name (A–Z)', desc: 'Name (Z–A)' },
  { key: 'company', label: 'Company', asc: 'Company (A–Z)', desc: 'Company (Z–A)' },
  { key: 'status', label: 'Status', asc: 'Status (pipeline order)', desc: 'Status (reverse)' },
  { key: 'ownerId', label: 'Owner', asc: 'Owner (A–Z)', desc: 'Owner (Z–A)' },
  { key: 'source', label: 'Source', asc: 'Source (A–Z)', desc: 'Source (Z–A)' },
  { key: 'lastActivityAt', label: 'Last activity', asc: 'Least recently active', desc: 'Recently active' },
  { key: 'value', label: 'Deal value', asc: 'Value (low–high)', desc: 'Value (high–low)', align: 'right' },
];
const SORT_OPTIONS = [...COLS.flatMap((c) => [{ v: `${c.key}:desc`, l: c.desc }, { v: `${c.key}:asc`, l: c.asc }]), { v: 'createdAt:desc', l: 'Newest first' }, { v: 'createdAt:asc', l: 'Oldest first' }];

export default function Leads() {
  const store = useStore();
  const fmt = useFormat();
  const sources = useSources();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'All') as 'All' | LeadStatus;
  const owner = params.get('owner') ?? '';
  const source = params.get('source') ?? '';
  const openLeadId = params.get('lead');
  const [q, setQ] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [sort, setSort] = useState('lastActivityAt:desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | { kind: 'add' } | { kind: 'edit'; lead: Lead } | { kind: 'delete'; ids: string[] } | { kind: 'import' }>(null);

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v && v !== 'All') p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  const { leads, owners } = store.db;
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const lo = min === '' ? -Infinity : Number(min); const hi = max === '' ? Infinity : Number(max);
    return leads.filter((l) =>
      (!owner || l.ownerId === owner) && (!source || l.source === source) && l.value >= lo && l.value <= hi &&
      (!needle || [l.name, l.company, l.email, l.phone, l.source].some((s) => s.toLowerCase().includes(needle))));
  }, [leads, q, owner, source, min, max]);

  const filtered = useMemo(() => {
    const [key, dir] = sort.split(':') as [SortKey, 'asc' | 'desc'];
    const rows = base.filter((l) => status === 'All' || l.status === status);
    const val = (l: Lead): string | number => key === 'ownerId' ? store.ownerById(l.ownerId)?.name ?? '' : key === 'status' ? LEAD_STATUSES.indexOf(l.status) : l[key];
    return rows.sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return dir === 'asc' ? c : -c;
    });
  }, [base, status, sort, store]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  useEffect(() => { setPage(1); }, [q, status, owner, source, min, max, sort, pageSize]);
  useEffect(() => { setSelected((s) => { const ids = new Set(leads.map((l) => l.id)); const n = new Set([...s].filter((i) => ids.has(i))); return n.size === s.size ? s : n; }); }, [leads]);

  const filterCount = [owner, source, min, max].filter(Boolean).length;
  const allPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const togglePage = () => setSelected((s) => { const n = new Set(s); rows.forEach((r) => (allPageSelected ? n.delete(r.id) : n.add(r.id))); return n; });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearFilters = () => { setQ(''); setMin(''); setMax(''); setParams(new URLSearchParams(), { replace: true }); };

  const exportCsv = () => {
    const list = selected.size ? leads.filter((l) => selected.has(l.id)) : filtered;
    const head = ['Name', 'Company', 'Email', 'Phone', 'Status', 'Owner', 'Source', 'Estimated value', 'Notes', 'Created', 'Last activity'];
    const body = list.map((l) => [l.name, l.company, l.email, l.phone, l.status, store.ownerById(l.ownerId)?.name ?? '', l.source, l.value, l.notes, l.createdAt, l.lastActivityAt]);
    downloadFile(`northstar-leads-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([head, ...body]));
  };

  const counts = (s: 'All' | LeadStatus) => (s === 'All' ? base.length : base.filter((l) => l.status === s).length);
  const won = leads.filter((l) => l.status === 'Won');
  const wonDeals = store.db.deals.filter((d) => d.stage === 'Won');
  const added30 = leads.filter((l) => Date.now() - new Date(l.createdAt).getTime() <= 30 * 86_400_000).length;
  const openLead = openLeadId ? store.leadById(openLeadId) : undefined;
  const closeDrawer = () => setParam('lead', '');

  const tabs = (['All', ...LEAD_STATUSES] as const).map((s) => ({ value: s, label: s === 'All' ? 'All leads' : s, count: counts(s) }));

  return (
    <>
      <PageHeader crumb="Sales" title="Leads" subtitle="Track, qualify, and convert your prospects."
        actions={<>
          <Button icon={<Upload className="h-4 w-4" />} onClick={() => setModal({ kind: 'import' })}>Import</Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>{selected.size ? `Export ${selected.size}` : 'Export'}</Button>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ kind: 'add' })}>Add lead</Button>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total leads" value={fmt.number(leads.length)} sub={`${added30} added in the last 30 days`} />
        <StatCard icon={<Award className="h-4 w-4" />} label="Qualified" value={fmt.number(leads.filter((l) => l.status === 'Qualified').length)} sub="Currently in Qualified status" to="/leads?status=Qualified" tint="bg-emerald-50 text-emerald-600" />
        <StatCard icon={<FilterIcon className="h-4 w-4" />} label="Conversion rate" value={leads.length ? fmt.percent((won.length / leads.length) * 100) : '—'} sub={`${won.length} of ${leads.length} leads won`} tint="bg-violet-50 text-violet-600" title="Won leads ÷ all leads" />
        <StatCard icon={<Database className="h-4 w-4" />} label="Avg. deal size" value={wonDeals.length ? fmt.money(sum(wonDeals.map((d) => d.value)) / wonDeals.length) : '—'} sub={`Across ${wonDeals.length} won deals`} tint="bg-amber-50 text-amber-600" />
      </div>

      <div className="mt-6"><Tabs label="Lead status" tabs={tabs} value={status} onChange={(v) => setParam('status', v)} variant="pill" /></div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <input type="search" aria-label="Search leads, companies, or people" placeholder="Search leads, companies, or people…" value={q} onChange={(e) => setQ(e.target.value)} className="input !pl-9" />
          </div>
          <Popover trigger={({ toggle, open }) => (
            <Button onClick={toggle} aria-expanded={open} aria-haspopup="dialog" icon={<FilterIcon className="h-4 w-4" />}>Filter{filterCount > 0 && <span className="rounded-full bg-primary-500 px-1.5 text-xs text-white">{filterCount}</span>}</Button>)}>
            {(close) => (
              <div className="space-y-3">
                <Field label="Owner">{(p) => <Select {...p} value={owner} onChange={(e) => setParam('owner', e.target.value)}><option value="">All owners</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}</Field>
                <Field label="Source">{(p) => <Select {...p} value={source} onChange={(e) => setParam('source', e.target.value)}><option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</Select>}</Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min value">{(p) => <Input {...p} type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} />}</Field>
                  <Field label="Max value">{(p) => <Input {...p} type="number" min="0" value={max} onChange={(e) => setMax(e.target.value)} />}</Field>
                </div>
                <div className="flex justify-between pt-1">
                  <Button size="sm" variant="ghost" onClick={() => { setMin(''); setMax(''); const p = new URLSearchParams(params); p.delete('owner'); p.delete('source'); setParams(p, { replace: true }); }}>Clear filters</Button>
                  <Button size="sm" variant="primary" onClick={close}>Done</Button>
                </div>
              </div>)}
          </Popover>
          <ToolbarSelect label="Sort by" value={SORT_OPTIONS.some((o) => o.v === sort) ? sort : 'lastActivityAt:desc'} onChange={(e) => setSort(e.target.value)} className="min-w-[190px]">
            {SORT_OPTIONS.map((o) => <option key={o.v} value={o.v}>Sort: {o.l}</option>)}
          </ToolbarSelect>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-primary-50/60 px-4 py-2.5" role="region" aria-label="Bulk actions">
            <span className="text-sm font-medium">{selected.size} selected</span>
            {!allPageSelected || selected.size < filtered.length ? <button className="text-sm text-primary-600 hover:underline" onClick={() => setSelected(new Set(filtered.map((l) => l.id)))}>Select all {filtered.length}</button> : null}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <ToolbarSelect label="Assign owner to selected" value="" onChange={(e) => { if (e.target.value) { store.bulkUpdateLeads([...selected], { ownerId: e.target.value }); } }} className="!w-44 [&_select]:!h-8 [&_select]:!text-[13px]">
                <option value="">Assign owner…</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </ToolbarSelect>
              <ToolbarSelect label="Set status for selected" value="" onChange={(e) => { if (e.target.value) { store.bulkUpdateLeads([...selected], { status: e.target.value as LeadStatus }); } }} className="!w-40 [&_select]:!h-8 [&_select]:!text-[13px]">
                <option value="">Set status…</option>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </ToolbarSelect>
              <Button size="sm" variant="secondary" className="!text-red-600" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setModal({ kind: 'delete', ids: [...selected] })}>Delete</Button>
              <IconButton label="Clear selection" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></IconButton>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title={leads.length === 0 ? 'No leads yet' : 'No leads match your filters'}
            message={leads.length === 0 ? 'Add your first lead or import a CSV file to get started.' : 'Try a different search, status or filter.'}
            action={leads.length === 0 ? <Button variant="primary" onClick={() => setModal({ kind: 'add' })}>Add lead</Button> : <Button onClick={clearFilters}>Clear search and filters</Button>} />
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm lg:min-w-[860px]">
                <thead>
                  <tr className="border-b border-line bg-slate-50/70 text-[13px] text-ink-soft">
                    <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all leads on this page" checked={allPageSelected} onChange={togglePage} /></th>
                    {COLS.map((c) => {
                      const [k, d] = sort.split(':');
                      const active = k === c.key;
                      return (
                        <th key={c.key} scope="col" aria-sort={active ? (d === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-3 py-3 font-medium ${c.align === 'right' ? 'text-right' : ''} ${c.key === 'source' || c.key === 'lastActivityAt' ? 'hidden lg:table-cell' : ''}`}>
                          <button className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`} onClick={() => setSort(`${c.key}:${active && d === 'desc' ? 'asc' : 'desc'}`)}>
                            {c.label}{active && (d === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                          </button>
                        </th>);
                    })}
                    <th className="w-12 px-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const o = store.ownerById(l.ownerId);
                    return (
                      <tr key={l.id} className={`border-b border-line last:border-0 hover:bg-slate-50/70 ${selected.has(l.id) ? 'bg-primary-50/40' : ''}`}>
                        <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${l.name}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                        <td className="px-3 py-3"><button className="flex items-center gap-3 text-left font-medium hover:text-primary-600" onClick={() => setParam('lead', l.id)}><Avatar name={l.name} size={32} />{l.name}</button></td>
                        <td className="px-3 py-3"><span className="flex items-center gap-2"><CompanyLogo name={l.company} size={22} />{l.company}</span></td>
                        <td className="px-3 py-3"><Badge tone={l.status} /></td>
                        <td className="px-3 py-3"><span className="flex items-center gap-2"><Avatar owner={o} size={26} />{o?.name}</span></td>
                        <td className="hidden px-3 py-3 text-ink-soft lg:table-cell">{l.source}</td>
                        <td className="hidden whitespace-nowrap px-3 py-3 text-ink-soft lg:table-cell">{fmt.relative(l.lastActivityAt)}</td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums">{fmt.money(l.value)}</td>
                        <td className="px-2 py-3"><IconButton label={`Edit ${l.name}`} onClick={() => setModal({ kind: 'edit', lead: l })}><Pencil className="h-4 w-4" /></IconButton></td>
                      </tr>);
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="divide-y divide-line md:hidden">
              {rows.map((l) => (
                <li key={l.id} className="flex items-start gap-3 p-4">
                  <input type="checkbox" className="mt-1" aria-label={`Select ${l.name}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setParam('lead', l.id)}>
                    <span className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{l.name}</span><Badge tone={l.status} /></span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft"><CompanyLogo name={l.company} size={16} />{l.company}</span>
                    <span className="mt-2 flex items-center justify-between text-xs text-ink-soft"><span>{store.ownerById(l.ownerId)?.name} · {l.source} · {fmt.relative(l.lastActivityAt)}</span><span className="text-sm font-semibold text-ink">{fmt.money(l.value)}</span></span>
                  </button>
                </li>))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-3 sm:p-4">
              <div className="flex items-center gap-3 text-sm text-ink-soft">
                <span>Showing {(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, filtered.length)} of {fmt.number(filtered.length)} leads</span>
                <label className="flex items-center gap-1.5"><span className="sr-only sm:not-sr-only">Rows</span>
                  <select aria-label="Rows per page" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-6 text-sm">{[10, 25, 50].map((n) => <option key={n}>{n}</option>)}</select></label>
              </div>
              <Pagination page={cur} pages={pages} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {openLead && <LeadDrawer lead={openLead} onClose={closeDrawer} />}
      {openLeadId && !openLead && <ConfirmDialog title="Lead not found" confirmLabel="Close" message="This lead no longer exists. It may have been deleted." onConfirm={closeDrawer} onClose={closeDrawer} />}
      {modal?.kind === 'add' && <LeadFormModal onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <LeadFormModal lead={modal.lead} onClose={() => setModal(null)} />}
      {modal?.kind === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal?.kind === 'delete' && (
        <ConfirmDialog title={`Delete ${modal.ids.length} lead${modal.ids.length === 1 ? '' : 's'}?`}
          message="This also removes their deals, tasks, notes and activity. This cannot be undone." confirmLabel="Delete"
          onConfirm={() => { store.deleteLeads(modal.ids); setSelected(new Set()); }} onClose={() => setModal(null)} />
      )}
    </>
  );
}
