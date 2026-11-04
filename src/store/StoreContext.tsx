import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Activity, BoardStage, Database, Deal, DealStage, Lead, LeadStatus, Note, Owner, Settings, Task } from '../types';
import { repository } from '../data/repository';
import { uid } from '../lib/id';
import { useToast } from '../components/ui/Toast';

type LeadInput = Pick<Lead, 'name' | 'company' | 'email' | 'phone' | 'status' | 'ownerId' | 'source' | 'value' | 'notes'>;
type DealInput = Pick<Deal, 'title' | 'company' | 'value' | 'stage' | 'ownerId' | 'priority' | 'expectedClose'> & { leadId: string };
type TaskInput = Pick<Task, 'title' | 'leadId' | 'dealId' | 'ownerId' | 'dueAt' | 'priority'>;

export interface Store {
  db: Database;
  me: Owner;
  ownerById: (id: string) => Owner | undefined;
  leadById: (id?: string) => Lead | undefined;
  dealById: (id?: string) => Deal | undefined;
  addLead: (input: LeadInput) => Lead;
  updateLead: (id: string, patch: Partial<LeadInput>) => void;
  deleteLeads: (ids: string[]) => void;
  bulkUpdateLeads: (ids: string[], patch: Partial<Pick<Lead, 'ownerId' | 'status'>>) => void;
  importLeads: (inputs: LeadInput[]) => number;
  addNote: (leadId: string, body: string) => void;
  addDeal: (input: DealInput) => Deal;
  updateDeal: (id: string, patch: Partial<DealInput>) => void;
  moveDeal: (id: string, stage: BoardStage) => void;
  markDealLost: (id: string, reason: string) => void;
  reopenDeal: (id: string, stage?: BoardStage) => void;
  deleteDeal: (id: string) => void;
  addTask: (input: TaskInput) => Task;
  updateTask: (id: string, patch: Partial<TaskInput>) => void;
  setTaskCompleted: (id: string, completed: boolean) => void;
  deleteTask: (id: string) => void;
  updateOwner: (id: string, patch: Partial<Owner>) => void;
  updateSettings: (patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => void;
  resetDemo: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
};

const now = () => new Date().toISOString();

/** Maps a deal stage to the lead status it implies. */
const stageToStatus = (stage: DealStage): LeadStatus => stage;

export function StoreProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [db, setDb] = useState<Database | null>(null);
  const [loadError, setLoadError] = useState(false);
  const dbRef = useRef<Database | null>(null);

  useEffect(() => {
    repository.load().then((d) => { dbRef.current = d; setDb(d); }).catch(() => setLoadError(true));
  }, []);

  /** Applies a pure transform, persists it, and publishes the result. */
  const commit = useCallback((fn: (d: Database) => Database) => {
    const next = fn(dbRef.current!);
    dbRef.current = next;
    setDb(next);
    repository.save(next).catch(() => toast.error('Could not save changes to browser storage. Changes may be lost on refresh.'));
  }, [toast]);

  const store = useMemo<Store | null>(() => {
    if (!db) return null;
    const me = db.owners.find((o) => o.id === db.settings.currentUserId) ?? db.owners[0];
    const actor = me.id;
    const getDb = () => dbRef.current!;
    const activity = (a: Omit<Activity, 'id' | 'actorId' | 'createdAt'>): Activity => ({ id: uid('a'), actorId: actor, createdAt: now(), ...a });
    const touchLead = (leads: Lead[], id: string | undefined, extra: Partial<Lead> = {}) =>
      leads.map((l) => (l.id === id ? { ...l, ...extra, updatedAt: now(), lastActivityAt: now() } : l));

    const api: Store = {
      db, me,
      ownerById: (id) => db.owners.find((o) => o.id === id),
      leadById: (id) => db.leads.find((l) => l.id === id),
      dealById: (id) => db.deals.find((d) => d.id === id),

      addLead: (input) => {
        const lead: Lead = { id: uid('l'), ...input, createdAt: now(), updatedAt: now(), lastActivityAt: now() };
        commit((d) => ({ ...d, leads: [lead, ...d.leads], activities: [activity({ verb: 'added', subject: lead.name, detail: 'as a new lead', leadId: lead.id }), ...d.activities] }));
        toast.success(`${lead.name} added to leads.`);
        return lead;
      },
      updateLead: (id, patch) => {
        const prev = getDb().leads.find((l) => l.id === id);
        if (!prev) return;
        const statusChanged = patch.status && patch.status !== prev.status;
        commit((d) => ({
          ...d,
          leads: touchLead(d.leads, id, patch),
          // keep related deal cards in sync with the lead's owner/company
          deals: d.deals.map((x) => (x.leadId === id ? { ...x, ...(patch.company ? { company: patch.company } : {}) } : x)),
          activities: [activity(statusChanged
            ? { verb: 'moved', subject: patch.name ?? prev.name, detail: `to ${patch.status}`, leadId: id }
            : { verb: 'updated', subject: patch.name ?? prev.name, leadId: id }), ...d.activities],
        }));
        toast.success('Lead updated.');
      },
      deleteLeads: (ids) => {
        const set = new Set(ids);
        commit((d) => ({
          ...d,
          leads: d.leads.filter((l) => !set.has(l.id)),
          deals: d.deals.filter((x) => !set.has(x.leadId)),
          tasks: d.tasks.filter((t) => !t.leadId || !set.has(t.leadId)),
          notes: d.notes.filter((n) => !set.has(n.leadId)),
          activities: d.activities.filter((a) => !a.leadId || !set.has(a.leadId)),
        }));
        toast.success(ids.length === 1 ? 'Lead deleted.' : `${ids.length} leads deleted.`);
      },
      bulkUpdateLeads: (ids, patch) => {
        const set = new Set(ids);
        commit((d) => ({
          ...d,
          leads: d.leads.map((l) => (set.has(l.id) ? { ...l, ...patch, updatedAt: now(), lastActivityAt: now() } : l)),
          activities: [activity({
            verb: 'updated', subject: `${ids.length} leads`,
            detail: patch.status ? `to ${patch.status}` : `owner to ${d.owners.find((o) => o.id === patch.ownerId)?.name ?? ''}`,
          }), ...d.activities],
        }));
        toast.success(`${ids.length} lead${ids.length === 1 ? '' : 's'} updated.`);
      },
      importLeads: (inputs) => {
        const leads: Lead[] = inputs.map((i) => ({ id: uid('l'), ...i, createdAt: now(), updatedAt: now(), lastActivityAt: now() }));
        commit((d) => ({ ...d, leads: [...leads, ...d.leads], activities: [activity({ verb: 'imported', subject: `${leads.length} leads`, detail: 'from CSV' }), ...d.activities] }));
        toast.success(`Imported ${leads.length} lead${leads.length === 1 ? '' : 's'}.`);
        return leads.length;
      },
      addNote: (leadId, body) => {
        const lead = getDb().leads.find((l) => l.id === leadId);
        const note: Note = { id: uid('n'), leadId, body, authorId: actor, createdAt: now() };
        commit((d) => ({ ...d, notes: [note, ...d.notes], leads: touchLead(d.leads, leadId), activities: [activity({ verb: 'added a note to', subject: lead?.name ?? 'lead', leadId }), ...d.activities] }));
        toast.success('Note added.');
      },

      addDeal: (input) => {
        const closed = input.stage === 'Won';
        const deal: Deal = { id: uid('d'), ...input, createdAt: now(), updatedAt: now(), closedAt: closed ? now() : undefined };
        commit((d) => ({
          ...d,
          deals: [deal, ...d.deals],
          leads: touchLead(d.leads, input.leadId, { status: stageToStatus(input.stage) }),
          activities: [activity({ verb: 'created a deal for', subject: input.company, dealId: deal.id, leadId: input.leadId }), ...d.activities],
        }));
        toast.success(`Deal for ${deal.company} created.`);
        return deal;
      },
      updateDeal: (id, patch) => {
        const prev = getDb().deals.find((x) => x.id === id);
        if (!prev) return;
        const stageChanged = patch.stage && patch.stage !== prev.stage;
        commit((d) => ({
          ...d,
          deals: d.deals.map((x) => {
            if (x.id !== id) return x;
            const next = { ...x, ...patch, updatedAt: now() };
            if (stageChanged) next.closedAt = patch.stage === 'Won' ? now() : undefined;
            return next;
          }),
          leads: stageChanged ? touchLead(d.leads, prev.leadId, { status: stageToStatus(patch.stage!) }) : d.leads,
          activities: [activity(stageChanged
            ? { verb: patch.stage === 'Won' ? 'closed' : 'moved', subject: prev.company, detail: patch.stage === 'Won' ? 'as won' : `to ${patch.stage}`, dealId: id, leadId: prev.leadId }
            : { verb: 'updated the deal for', subject: prev.company, dealId: id, leadId: prev.leadId }), ...d.activities],
        }));
        toast.success('Deal updated.');
      },
      moveDeal: (id, stage) => {
        const prev = getDb().deals.find((x) => x.id === id);
        if (!prev || prev.stage === stage) return;
        commit((d) => ({
          ...d,
          deals: d.deals.map((x) => (x.id === id ? { ...x, stage, updatedAt: now(), closedAt: stage === 'Won' ? now() : undefined, lostReason: undefined } : x)),
          leads: touchLead(d.leads, prev.leadId, { status: stageToStatus(stage) }),
          activities: [activity({ verb: stage === 'Won' ? 'closed' : 'moved', subject: prev.company, detail: stage === 'Won' ? 'as won' : `to ${stage}`, dealId: id, leadId: prev.leadId }), ...d.activities],
        }));
        toast.success(stage === 'Won' ? `${prev.company} marked as Won.` : `${prev.company} moved to ${stage}.`);
      },
      markDealLost: (id, reason) => {
        const prev = getDb().deals.find((x) => x.id === id);
        if (!prev) return;
        commit((d) => ({
          ...d,
          deals: d.deals.map((x) => (x.id === id ? { ...x, stage: 'Lost', lostReason: reason, closedAt: now(), updatedAt: now() } : x)),
          leads: touchLead(d.leads, prev.leadId, { status: 'Lost' }),
          activities: [activity({ verb: 'lost', subject: prev.company, detail: 'deal', dealId: id, leadId: prev.leadId }), ...d.activities],
        }));
        toast.info(`${prev.company} marked as Lost.`);
      },
      reopenDeal: (id, stage = 'New') => {
        const prev = getDb().deals.find((x) => x.id === id);
        if (!prev) return;
        commit((d) => ({
          ...d,
          deals: d.deals.map((x) => (x.id === id ? { ...x, stage, lostReason: undefined, closedAt: undefined, updatedAt: now() } : x)),
          leads: touchLead(d.leads, prev.leadId, { status: stageToStatus(stage) }),
          activities: [activity({ verb: 'reopened', subject: prev.company, detail: `in ${stage}`, dealId: id, leadId: prev.leadId }), ...d.activities],
        }));
        toast.success(`${prev.company} reopened in ${stage}.`);
      },
      deleteDeal: (id) => {
        commit((d) => ({
          ...d,
          deals: d.deals.filter((x) => x.id !== id),
          tasks: d.tasks.map((t) => (t.dealId === id ? { ...t, dealId: undefined } : t)),
          activities: d.activities.filter((a) => a.dealId !== id),
        }));
        toast.success('Deal deleted.');
      },

      addTask: (input) => {
        const task: Task = { id: uid('t'), ...input, assignedById: actor, completed: false, createdAt: now() };
        commit((d) => ({ ...d, tasks: [task, ...d.tasks], activities: [activity({ verb: 'created task', subject: task.title, taskId: task.id, leadId: task.leadId }), ...d.activities] }));
        toast.success('Task added.');
        return task;
      },
      updateTask: (id, patch) => {
        commit((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
        toast.success('Task updated.');
      },
      setTaskCompleted: (id, completed) => {
        const prev = getDb().tasks.find((t) => t.id === id);
        if (!prev) return;
        commit((d) => ({
          ...d,
          tasks: d.tasks.map((t) => (t.id === id ? { ...t, completed, completedAt: completed ? now() : undefined } : t)),
          activities: completed ? [activity({ verb: 'completed task', subject: prev.title, taskId: id, leadId: prev.leadId }), ...d.activities] : d.activities,
        }));
        toast.success(completed ? 'Task completed.' : 'Task reopened.');
      },
      deleteTask: (id) => {
        commit((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id), activities: d.activities.filter((a) => a.taskId !== id) }));
        toast.success('Task deleted.');
      },

      updateOwner: (id, patch) => commit((d) => ({ ...d, owners: d.owners.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      updateSettings: (patch) =>
        commit((d) => ({ ...d, settings: { ...d.settings, ...(typeof patch === 'function' ? patch(d.settings) : patch) } })),
      resetDemo: async () => {
        const seed = await repository.reset();
        dbRef.current = seed;
        setDb(seed);
        toast.success('Demo data restored.');
      },
    };
    return api;
  }, [db, commit, toast]);

  if (loadError) return <div className="p-8 text-sm text-red-600">Could not load workspace data.</div>;
  if (!store) return <div className="flex h-full items-center justify-center text-sm text-ink-soft" role="status">Loading workspace…</div>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
