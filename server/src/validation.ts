import { z } from 'zod';

const trim = z.string().trim();
const isoDate = z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), 'Enter a valid date.');
const money = z.number({ error: 'Enter a number.' }).min(0, 'Must be 0 or more.').max(1e12, 'Value is too large.');
const email = trim.max(254).refine((s) => s === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s), 'Enter a valid email address.');

export const LEAD_STATUS = z.enum(['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']);
export const BOARD_STAGE = z.enum(['New', 'Qualified', 'Proposal', 'Negotiation', 'Won']);
export const PRIORITY = z.enum(['High', 'Medium', 'Low']);
export const ROLE = z.enum(['Admin', 'Manager', 'Sales rep', 'Viewer']);
const uuid = z.string().uuid('Invalid id.');

// No `.default()` here: partial() (used for PATCH) must not reset omitted fields. Use withLeadDefaults() on create.
export const leadInput = z.object({
  name: trim.min(1, 'Enter the lead’s name.').max(200),
  company: trim.min(1, 'Enter a company.').max(200),
  email: email.optional(),
  phone: trim.max(60).optional(),
  status: LEAD_STATUS.optional(),
  ownerId: uuid,
  source: trim.min(1).max(80).optional(),
  value: money.optional(),
  notes: trim.max(5000).optional(),
});
export const withLeadDefaults = (d: z.infer<typeof leadInput>) => ({
  ...d, email: d.email ?? '', phone: d.phone ?? '', status: d.status ?? 'New', source: d.source ?? 'Website', value: d.value ?? 0, notes: d.notes ?? '',
});
export const leadPatch = leadInput.partial();
export const leadBulk = z.object({
  ids: z.array(uuid).min(1).max(1000),
  patch: z.object({ ownerId: uuid.optional(), status: LEAD_STATUS.optional() }).refine((p) => p.ownerId || p.status, 'Nothing to update.'),
});
export const idList = z.object({ ids: z.array(uuid).min(1).max(1000) });
export const leadImport = z.object({ leads: z.array(leadInput).min(1).max(1000) });
export const noteInput = z.object({ body: trim.min(1, 'Enter a note.').max(5000) });

export const dealInput = z.object({
  leadId: uuid,
  title: trim.min(1, 'Enter a deal name.').max(200),
  company: trim.min(1, 'Enter a company.').max(200),
  value: money,
  stage: BOARD_STAGE,
  ownerId: uuid,
  priority: PRIORITY,
  expectedClose: isoDate,
});
export const dealPatch = dealInput.omit({ leadId: true }).partial();
export const stageInput = z.object({ stage: BOARD_STAGE });
export const lostInput = z.object({ reason: trim.min(1, 'Enter a reason.').max(500) });
export const reopenInput = z.object({ stage: BOARD_STAGE.default('New') });

export const taskInput = z.object({
  title: trim.min(1, 'Enter a task title.').max(300),
  leadId: uuid.nullish(),
  dealId: uuid.nullish(),
  ownerId: uuid,
  dueAt: isoDate,
  priority: PRIORITY,
});
export const taskPatch = taskInput.partial();
export const completeInput = z.object({ completed: z.boolean() });

export const registerInput = z.object({
  name: trim.min(1, 'Enter your name.').max(120),
  email: email.refine((s) => s !== '', 'Enter your email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(72, 'Use at most 72 characters.'),
  workspaceName: trim.min(1, 'Enter a workspace name.').max(120),
  sampleData: z.boolean().default(false),
});
export const loginInput = z.object({ email: trim.min(1, 'Enter your email.'), password: z.string().min(1, 'Enter your password.') });
export const passwordInput = z.object({ currentPassword: z.string().min(1, 'Enter your current password.'), newPassword: z.string().min(8, 'Use at least 8 characters.').max(72) });

export const profilePatch = z.object({
  name: trim.min(1, 'Enter your name.').max(120).optional(),
  email: email.refine((s) => s !== '', 'Enter your email address.').optional(),
  jobTitle: trim.max(120).optional(),
  photo: z.string().max(200_000, 'Photo is too large.').regex(/^data:image\/(png|jpeg|webp);base64,/, 'Photo must be a PNG, JPEG or WebP image.').nullable().optional(),
});
export const notificationsPatch = z.object({ emailUpdates: z.boolean().optional(), taskReminders: z.boolean().optional(), weeklySummary: z.boolean().optional() });
export const memberInput = z.object({
  name: trim.min(1, 'Enter a name.').max(120),
  email: email.refine((s) => s !== '', 'Enter an email address.'),
  jobTitle: trim.max(120).default(''),
  role: ROLE.default('Sales rep'),
  password: z.string().min(8, 'Use at least 8 characters.').max(72),
});
export const rolePatch = z.object({ role: ROLE });

const pct = z.number().min(0, '0–100').max(100, '0–100');
export const workspacePatch = z.object({
  name: trim.min(1, 'Enter a workspace name.').max(120).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code.').optional(),
  language: trim.min(2).max(20).optional(),
  timeZone: trim.min(1).max(60).optional(),
  dateFormat: z.enum(['MMM d, yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']).optional(),
  monthlyTarget: money.optional(),
  probabilities: z.object({ New: pct, Qualified: pct, Proposal: pct, Negotiation: pct }).partial().optional(),
});
