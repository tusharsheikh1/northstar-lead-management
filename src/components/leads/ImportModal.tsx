import { useMemo, useRef, useState } from 'react';
import { FileUp, TriangleAlert, Download } from 'lucide-react';
import { LEAD_STATUSES, type Lead, type LeadStatus } from '../../types';
import { useStore } from '../../store/StoreContext';
import { downloadFile, parseCsv, toCsv } from '../../lib/csv';
import { isEmail } from '../../lib/validate';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Form';

type Field = 'name' | 'company' | 'email' | 'phone' | 'status' | 'owner' | 'source' | 'value' | 'notes';
const FIELDS: { key: Field; label: string; required?: boolean; aliases: string[] }[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'full name', 'lead', 'contact'] },
  { key: 'company', label: 'Company', required: true, aliases: ['company', 'organization', 'organisation', 'account'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'email address'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'telephone', 'mobile'] },
  { key: 'status', label: 'Status', aliases: ['status', 'stage'] },
  { key: 'owner', label: 'Owner', aliases: ['owner', 'assigned to', 'rep'] },
  { key: 'source', label: 'Source', aliases: ['source', 'lead source', 'channel'] },
  { key: 'value', label: 'Estimated value', aliases: ['value', 'estimated value', 'deal value', 'amount'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments'] },
];
const MAX_BYTES = 2_000_000;

export const LEAD_CSV_TEMPLATE = toCsv([
  ['Name', 'Company', 'Email', 'Phone', 'Status', 'Owner', 'Source', 'Estimated value', 'Notes'],
  ['Jane Doe', 'Example Co', 'jane@example.com', '+1 555 0100', 'New', 'Maya Chen', 'Website', 12000, 'Met at an event'],
]);

type Input = Pick<Lead, 'name' | 'company' | 'email' | 'phone' | 'status' | 'ownerId' | 'source' | 'value' | 'notes'>;

export function ImportModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [map, setMap] = useState<Record<Field, number>>({} as Record<Field, number>);
  const fileRef = useRef<HTMLInputElement>(null);
  const header = rows[0] ?? [];

  const load = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { setError('Please choose a .csv file.'); return; }
    if (file.size > MAX_BYTES) { setError('That file is larger than 2 MB. Split it into smaller files.'); return; }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) { setError('The file needs a header row and at least one data row.'); return; }
    setRows(parsed);
    setFileName(file.name);
    const guess = {} as Record<Field, number>;
    FIELDS.forEach((f) => { guess[f.key] = parsed[0].findIndex((h) => f.aliases.includes(h.trim().toLowerCase())); });
    setMap(guess);
    setStep(2);
  };

  const existingEmails = useMemo(() => new Set(store.db.leads.map((l) => l.email.toLowerCase()).filter(Boolean)), [store.db.leads]);

  const result = useMemo(() => {
    if (step !== 3) return { valid: [] as Input[], issues: [] as { row: number; msg: string }[], warnings: 0 };
    const get = (r: string[], k: Field) => (map[k] >= 0 ? (r[map[k]] ?? '').trim() : '');
    const valid: Input[] = [];
    const issues: { row: number; msg: string }[] = [];
    const seen = new Set<string>();
    let warnings = 0;
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const name = get(r, 'name'); const company = get(r, 'company'); const email = get(r, 'email');
      const problems: string[] = [];
      if (!name) problems.push('name is required');
      if (!company) problems.push('company is required');
      if (email && !isEmail(email)) problems.push(`invalid email “${email}”`);
      if (email && (existingEmails.has(email.toLowerCase()) || seen.has(email.toLowerCase()))) problems.push('duplicate email');
      const rawVal = get(r, 'value');
      const value = rawVal === '' ? 0 : Number(rawVal.replace(/[^0-9.\-]/g, ''));
      if (rawVal !== '' && (Number.isNaN(value) || value < 0)) problems.push(`invalid value “${rawVal}”`);
      if (problems.length) { issues.push({ row: line, msg: problems.join('; ') }); return; }
      const statusRaw = get(r, 'status');
      const status = LEAD_STATUSES.find((s) => s.toLowerCase() === statusRaw.toLowerCase());
      if (statusRaw && !status) warnings++;
      const ownerRaw = get(r, 'owner').toLowerCase();
      const owner = store.db.owners.find((o) => o.name.toLowerCase() === ownerRaw || o.email.toLowerCase() === ownerRaw);
      if (ownerRaw && !owner) warnings++;
      if (email) seen.add(email.toLowerCase());
      valid.push({ name, company, email, phone: get(r, 'phone'), status: (status ?? 'New') as LeadStatus, ownerId: owner?.id ?? store.me.id, source: get(r, 'source') || 'Import', value, notes: get(r, 'notes') });
    });
    return { valid, issues, warnings };
  }, [step, rows, map, existingEmails, store.db.owners, store.me.id]);

  const missingRequired = FIELDS.filter((f) => f.required && !(map[f.key] >= 0));

  return (
    <Modal title="Import leads from CSV" description={`Step ${step} of 3`} onClose={onClose} size="lg"
      footer={<>
        {step === 2 && <Button onClick={() => setStep(1)}>Back</Button>}
        {step === 3 && <Button onClick={() => setStep(2)}>Back</Button>}
        <Button onClick={onClose}>Cancel</Button>
        {step === 2 && <Button variant="primary" disabled={missingRequired.length > 0} onClick={() => setStep(3)}>Validate</Button>}
        {step === 3 && <Button variant="primary" disabled={!result.valid.length} onClick={() => { store.importLeads(result.valid); onClose(); }}>Import {result.valid.length} lead{result.valid.length === 1 ? '' : 's'}</Button>}
      </>}>
      {step === 1 && (
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-primary-400 hover:bg-primary-50/40">
            <FileUp className="h-8 w-8 text-primary-500" aria-hidden />
            <span className="text-sm font-medium">Choose a CSV file or drop it here</span>
            <span className="text-xs text-ink-soft">Max 2 MB. First row must contain column headers.</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => load(e.target.files?.[0])} />
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <Button className="mt-4" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadFile('northstar-leads-template.csv', LEAD_CSV_TEMPLATE)}>Download template</Button>
        </div>
      )}
      {step === 2 && (
        <div>
          <p className="mb-4 text-sm text-ink-soft"><strong className="text-ink">{fileName}</strong> · {rows.length - 1} data rows. Match each Northstar field to a column in your file.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`map-${f.key}`} className="mb-1 block text-[13px] font-medium">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                <Select id={`map-${f.key}`} value={map[f.key] ?? -1} onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))}>
                  <option value={-1}>— Do not import —</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </Select>
              </div>
            ))}
          </div>
          {missingRequired.length > 0 && <p role="alert" className="mt-3 text-sm text-red-600">Map the required field{missingRequired.length > 1 ? 's' : ''}: {missingRequired.map((f) => f.label).join(', ')}.</p>}
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-emerald-50 p-3"><div className="text-2xl font-bold text-emerald-700">{result.valid.length}</div><div className="text-xs text-emerald-800">Ready to import</div></div>
            <div className="rounded-xl bg-red-50 p-3"><div className="text-2xl font-bold text-red-700">{result.issues.length}</div><div className="text-xs text-red-800">Rows skipped</div></div>
            <div className="rounded-xl bg-amber-50 p-3"><div className="text-2xl font-bold text-amber-700">{result.warnings}</div><div className="text-xs text-amber-800">Defaults applied</div></div>
          </div>
          {result.warnings > 0 && <p className="text-xs text-ink-soft">Unknown statuses default to “New”; unknown owners default to you ({store.me.name}).</p>}
          {result.issues.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-red-50/50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-700"><TriangleAlert className="h-4 w-4" />These rows will be skipped</p>
              <ul className="space-y-1 text-[13px] text-red-800">{result.issues.slice(0, 50).map((i) => <li key={i.row}>Row {i.row}: {i.msg}</li>)}{result.issues.length > 50 && <li>…and {result.issues.length - 50} more</li>}</ul>
            </div>
          )}
          {!result.valid.length && <p role="alert" className="text-sm text-red-600">No valid rows to import. Go back and check your column mapping.</p>}
        </div>
      )}
    </Modal>
  );
}
