export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const DEAL_STAGES = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won'] as const;
export type BoardStage = (typeof DEAL_STAGES)[number];
export type DealStage = BoardStage | 'Lost';
export const OPEN_STAGES: BoardStage[] = ['New', 'Qualified', 'Proposal', 'Negotiation'];

export const LEAD_SOURCES = ['Website', 'Referral', 'LinkedIn', 'Events', 'Partner', 'Conference', 'Email'] as const;
export type LeadSource = string;

export const PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Role = 'Admin' | 'Manager' | 'Sales rep' | 'Viewer';
export const ROLES: Role[] = ['Admin', 'Manager', 'Sales rep', 'Viewer'];

export interface Owner {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  role: Role;
  color: string; // avatar tint
  photo?: string; // data URL
  canSignIn?: boolean; // false for sample members without a login
  phone?: string;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: LeadStatus;
  ownerId: string;
  source: LeadSource;
  value: number;
  notes: string;
  doNotContact?: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export interface Deal {
  id: string;
  leadId: string;
  title: string;
  company: string;
  value: number;
  stage: DealStage;
  ownerId: string;
  priority: Priority;
  expectedClose: string; // ISO date-time
  lostReason?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string; // set when Won or Lost
}

export interface Task {
  id: string;
  title: string;
  leadId?: string;
  dealId?: string;
  ownerId: string;
  assignedById: string;
  dueAt: string;
  priority: Priority;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface Note {
  id: string;
  leadId: string;
  body: string;
  authorId: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  actorId: string;
  verb: string; // e.g. "moved"
  subject: string; // e.g. "Olivia Rhye"
  detail?: string; // e.g. "to Qualified"
  leadId?: string;
  dealId?: string;
  taskId?: string;
  createdAt: string;
}

export interface Settings {
  currentUserId: string;
  workspace: {
    name: string;
    currency: string;
    language: string;
    timeZone: string;
    dateFormat: string;
    monthlyTarget: number;
    reminderLeadMinutes?: number;
    isDemo?: boolean; // workspace currently holds sample data
  };
  probabilities: Record<BoardStage, number>; // percent 0-100
  notifications: { emailUpdates: boolean; taskReminders: boolean; weeklySummary: boolean; smsReminders?: boolean };
  /** How each outgoing channel is set up on the server: live = real delivery, log = dev only (not delivered), none = off. */
  channels?: { email: ChannelMode; sms: ChannelMode };
}
export type ChannelMode = 'live' | 'log' | 'none';

export interface Database {
  version: number;
  owners: Owner[];
  leads: Lead[];
  deals: Deal[];
  tasks: Task[];
  notes: Note[];
  activities: Activity[];
  settings: Settings;
}
