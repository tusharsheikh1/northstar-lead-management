import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BoardStage, Database, Deal, Lead, Owner, Role, Settings, Task } from '../types';
import { api, ApiError, type Mutation } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { useSession } from './SessionContext';

type LeadInput = Pick<Lead, 'name' | 'company' | 'email' | 'phone' | 'status' | 'ownerId' | 'source' | 'value' | 'notes'>;
type DealInput = Pick<Deal, 'title' | 'company' | 'value' | 'stage' | 'ownerId' | 'priority' | 'expectedClose'> & { leadId: string };
type TaskInput = Pick<Task, 'title' | 'leadId' | 'dealId' | 'ownerId' | 'dueAt' | 'priority'>;
type WorkspacePatch = Partial<Omit<Settings['workspace'], 'isDemo'>> & { probabilities?: Partial<Settings['probabilities']> };

/**
 * All actions are async: they call the API, then replace local state with the server's fresh snapshot.
 * They resolve to the result on success, or `undefined` after showing an error toast.
 */
export interface Store {
  db: Database;
  me: Owner;
  ownerById: (id: string) => Owner | undefined;
  leadById: (id?: string) => Lead | undefined;
  dealById: (id?: string) => Deal | undefined;
  addLead: (input: LeadInput) => Promise<Lead | undefined>;
  updateLead: (id: string, patch: Partial<LeadInput>) => Promise<boolean>;
  deleteLeads: (ids: string[]) => Promise<boolean>;
  bulkUpdateLeads: (ids: string[], patch: Partial<Pick<Lead, 'ownerId' | 'status'>>) => Promise<boolean>;
  importLeads: (inputs: LeadInput[]) => Promise<number | undefined>;
  addNote: (leadId: string, body: string) => Promise<boolean>;
  addDeal: (input: DealInput) => Promise<Deal | undefined>;
  updateDeal: (id: string, patch: Partial<Omit<DealInput, 'leadId'>>) => Promise<boolean>;
  moveDeal: (id: string, stage: BoardStage) => Promise<boolean>;
  markDealLost: (id: string, reason: string) => Promise<boolean>;
  reopenDeal: (id: string, stage?: BoardStage) => Promise<boolean>;
  deleteDeal: (id: string) => Promise<boolean>;
  addTask: (input: TaskInput) => Promise<Task | undefined>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<boolean>;
  setTaskCompleted: (id: string, completed: boolean) => Promise<boolean>;
  deleteTask: (id: string) => Promise<boolean>;
  updateProfile: (patch: { name?: string; email?: string; jobTitle?: string; photo?: string | null }) => Promise<boolean>;
  saveNotifications: (patch: Partial<Settings['notifications']>) => Promise<boolean>;
  saveWorkspace: (patch: WorkspacePatch) => Promise<boolean>;
  addMember: (input: { name: string; email: string; jobTitle: string; role: Role; password: string }) => Promise<boolean>;
  setMemberRole: (id: string, role: Role) => Promise<boolean>;
  loadSampleData: () => Promise<boolean>;
  clearData: () => Promise<boolean>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
};

export function StoreProvider({ initial, children }: { initial: Database; children: ReactNode }) {
  const toast = useToast();
  const { logout } = useSession();
  const [db, setDb] = useState<Database>(initial);
  const dbRef = useRef(db);
  dbRef.current = db;

  const actions = useMemo<Omit<Store, 'db' | 'me'>>(() => {
    const apply = (data: Database) => { dbRef.current = data; setDb(data); };

    /** Runs a mutation. On failure shows the server's message; on 401 returns to the sign-in screen. */
    const run = async <R,>(call: () => Promise<Mutation<R>>, success?: string | ((r: R) => string | undefined)): Promise<{ result: R; data: Database } | undefined> => {
      try {
        const out = await call();
        apply(out.data);
        const msg = typeof success === 'function' ? success(out.result) : success;
        if (msg) toast.success(msg);
        return out;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { toast.error('Your session has expired. Please sign in again.'); await logout(); return undefined; }
        toast.error(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
        return undefined;
      }
    };
    const ok = async <R,>(call: () => Promise<Mutation<R>>, success?: string | ((r: R) => string | undefined)) => !!(await run(call, success));
    const idOf = (o?: { result: { id: string }; data: Database }) => o?.result.id;
    const refresh = async () => { try { apply((await api.get<{ data: Database }>('/data')).data); } catch { /* keep optimistic state */ } };

    const optimistic = (fn: (d: Database) => Database) => apply(fn(dbRef.current));

    return {
      ownerById: (id) => dbRef.current.owners.find((o) => o.id === id),
      leadById: (id) => dbRef.current.leads.find((l) => l.id === id),
      dealById: (id) => dbRef.current.deals.find((d) => d.id === id),

      addLead: async (input) => {
        const out = await run<{ id: string }>(() => api.post('/leads', input));
        const id = idOf(out);
        if (id) toast.success(`${input.name} added to leads.`);
        return id ? out!.data.leads.find((l) => l.id === id) : undefined;
      },
      updateLead: (id, patch) => ok(() => api.patch(`/leads/${id}`, patch), 'Lead updated.'),
      deleteLeads: (ids) => ok(() => api.post('/leads/bulk-delete', { ids }), ids.length === 1 ? 'Lead deleted.' : `${ids.length} leads deleted.`),
      bulkUpdateLeads: (ids, patch) => ok(() => api.patch('/leads/bulk', { ids, patch }), `${ids.length} lead${ids.length === 1 ? '' : 's'} updated.`),
      importLeads: async (inputs) => {
        const out = await run<{ imported: number; skipped: number }>(() => api.post('/leads/import', { leads: inputs }),
          (r) => `Imported ${r.imported} lead${r.imported === 1 ? '' : 's'}${r.skipped ? `; skipped ${r.skipped} duplicate${r.skipped === 1 ? '' : 's'}` : ''}.`);
        return out?.result.imported;
      },
      addNote: (leadId, body) => ok(() => api.post(`/leads/${leadId}/notes`, { body }), 'Note added.'),

      addDeal: async (input) => {
        const out = await run<{ id: string }>(() => api.post('/deals', input), `Deal for ${input.company} created.`);
        const id = idOf(out);
        return id ? out!.data.deals.find((d) => d.id === id) : undefined;
      },
      updateDeal: (id, patch) => ok(() => api.patch(`/deals/${id}`, patch), 'Deal updated.'),
      moveDeal: async (id, stage) => {
        const prev = dbRef.current.deals.find((d) => d.id === id);
        if (!prev || prev.stage === stage) return false;
        // Optimistic: move the card instantly, then reconcile with the server's snapshot.
        optimistic((d) => ({ ...d, deals: d.deals.map((x) => (x.id === id ? { ...x, stage, closedAt: stage === 'Won' ? new Date().toISOString() : undefined, lostReason: undefined } : x)) }));
        const done = await ok(() => api.post(`/deals/${id}/move`, { stage }), stage === 'Won' ? `${prev.company} marked as Won.` : `${prev.company} moved to ${stage}.`);
        if (!done) await refresh();
        return done;
      },
      markDealLost: async (id, reason) => {
        const company = dbRef.current.deals.find((d) => d.id === id)?.company ?? 'Deal';
        const done = await ok(() => api.post(`/deals/${id}/lost`, { reason }));
        if (done) toast.info(`${company} marked as Lost.`);
        return done;
      },
      reopenDeal: (id, stage = 'New') => ok(() => api.post(`/deals/${id}/reopen`, { stage }), `Deal reopened in ${stage}.`),
      deleteDeal: (id) => ok(() => api.del(`/deals/${id}`), 'Deal deleted.'),

      addTask: async (input) => {
        const out = await run<{ id: string }>(() => api.post('/tasks', input), 'Task added.');
        const id = idOf(out);
        return id ? out!.data.tasks.find((t) => t.id === id) : undefined;
      },
      updateTask: (id, patch) => {
        const body: Record<string, unknown> = { ...patch };
        if ('leadId' in patch) body.leadId = patch.leadId ?? null;
        if ('dealId' in patch) body.dealId = patch.dealId ?? null;
        return ok(() => api.patch(`/tasks/${id}`, body), 'Task updated.');
      },
      setTaskCompleted: async (id, completed) => {
        optimistic((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, completed, completedAt: completed ? new Date().toISOString() : undefined } : t)) }));
        const done = await ok(() => api.post(`/tasks/${id}/complete`, { completed }), completed ? 'Task completed.' : 'Task reopened.');
        if (!done) await refresh();
        return done;
      },
      deleteTask: (id) => ok(() => api.del(`/tasks/${id}`), 'Task deleted.'),

      updateProfile: (patch) => ok(() => api.patch('/me', patch)),
      saveNotifications: (patch) => ok(() => api.patch('/me/notifications', patch), 'Notification preference saved.'),
      saveWorkspace: (patch) => ok(() => api.patch('/workspace', patch), 'Workspace settings saved.'),
      addMember: (input) => ok(() => api.post('/users', input), `${input.name} added to the team.`),
      setMemberRole: (id, role) => ok(() => api.patch(`/users/${id}/role`, { role }), `Role updated to ${role}.`),
      loadSampleData: () => ok(() => api.post('/workspace/sample-data'), 'Sample data loaded.'),
      clearData: () => ok(() => api.del('/workspace/data'), 'All leads, deals and tasks deleted.'),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, logout]);

  // Actions read live state from a ref; the context value changes with `db` so consumers re-render.
  const value = useMemo<Store>(() => ({
    ...actions, db,
    me: db.owners.find((o) => o.id === db.settings.currentUserId) ?? db.owners[0],
  }), [actions, db]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
