import type { Activity, Database, Deal, Lead, LeadStatus, Note, Owner, Priority, Task } from '../types';

export const DB_VERSION = 1;

const DAY = 86_400_000;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const OWNERS: Owner[] = [
  { id: 'u1', name: 'Maya Chen', email: 'maya.chen@northstar.demo', jobTitle: 'Sales Manager', role: 'Admin', color: '#4169E1' },
  { id: 'u2', name: 'Tom Cook', email: 'tom.cook@northstar.demo', jobTitle: 'Account Executive', role: 'Sales rep', color: '#0e9f6e' },
  { id: 'u3', name: 'Alex Morgan', email: 'alex.morgan@northstar.demo', jobTitle: 'Account Executive', role: 'Sales rep', color: '#d97706' },
  { id: 'u4', name: 'Sam Rivera', email: 'sam.rivera@northstar.demo', jobTitle: 'Sales Development Rep', role: 'Sales rep', color: '#9333ea' },
];

// [name, company, status, source, value, owner(1-4), createdDaysAgo, lastActivityDaysAgo, extra]
// extra: closedDaysAgo for Won/Lost, expected-close in days for open deals (omit = no deal)
type Row = [string, string, LeadStatus, string, number, number, number, number, number?];

const ROWS: Row[] = [
  // Won
  ['Candice Wu', 'Dropbox', 'Won', 'Conference', 21000, 2, 0, 3, 3],
  ['Orlando Diggs', 'Orca Labs', 'Won', 'Partner', 28000, 2, 0, 9, 9],
  ['Kate Morrison', 'Shopify', 'Won', 'Referral', 12500, 1, 0, 16, 16],
  ['Zahir Mays', 'Webflow', 'Won', 'Website', 8200, 3, 0, 24, 24],
  ['Mathilde Lewis', 'Asana', 'Won', 'LinkedIn', 15400, 1, 0, 33, 33],
  ['Amelie Laurent', 'Canva', 'Won', 'Website', 6900, 4, 0, 41, 41],
  ['Ammar Foley', 'Datadog', 'Won', 'Events', 24000, 2, 0, 52, 52],
  ['Marco Kelly', 'Vercel', 'Won', 'Referral', 9800, 3, 0, 60, 60],
  ['Lyle Kauffman', 'Miro', 'Won', 'Website', 7400, 1, 0, 68, 68],
  ['Noah Pierre', 'Intercom', 'Won', 'LinkedIn', 11200, 2, 0, 77, 77],
  ['Sienna Hewitt', 'Loom', 'Won', 'Partner', 5600, 3, 0, 88, 88],
  ['Isaac Stewart', 'Zapier', 'Won', 'Website', 13600, 1, 0, 99, 99],
  ['Eliot Ray', 'Slack', 'Won', 'Conference', 18800, 2, 0, 112, 112],
  ['Naomi Chung', 'Airtable', 'Won', 'Referral', 6200, 3, 0, 126, 126],
  ['Jordan Blake', 'HubSpot', 'Won', 'Events', 9400, 1, 0, 141, 141],
  ['Hana Park', 'Typeform', 'Won', 'Website', 4800, 4, 0, 158, 158],
  // Lost
  ['Ravi Shah', 'Gusto', 'Lost', 'LinkedIn', 7800, 3, 0, 5, 5],
  ['Elodie Marsh', 'Brex', 'Lost', 'Website', 9200, 1, 0, 11, 11],
  ['Theo Grant', 'Ramp', 'Lost', 'Events', 6400, 2, 0, 14, 14],
  ['Mia Alvarez', 'Calendly', 'Lost', 'Referral', 5100, 4, 0, 19, 19],
  ['Finn Doyle', 'Mailchimp', 'Lost', 'Website', 11000, 3, 0, 26, 26],
  ['Aria Novak', 'Twilio', 'Lost', 'Partner', 14500, 2, 0, 28, 28],
  ['Dante Rossi', 'Okta', 'Lost', 'LinkedIn', 8600, 1, 0, 36, 36],
  ['Yara Haddad', 'Segment', 'Lost', 'Website', 5900, 3, 0, 45, 45],
  ['Felix Andersson', 'Mixpanel', 'Lost', 'Events', 10400, 2, 0, 50, 50],
  ['Ivy Thornton', 'Retool', 'Lost', 'Referral', 7100, 1, 0, 57, 57],
  ['Owen Barker', 'Plaid', 'Lost', 'Website', 12200, 4, 0, 70, 70],
  ['Ada Lindgren', 'Rippling', 'Lost', 'LinkedIn', 9600, 2, 0, 95, 95],
  ['Silas Wright', 'GitLab', 'Lost', 'Partner', 15800, 3, 0, 130, 130],
  // Negotiation
  ['Drew Cano', 'Figma', 'Negotiation', 'Conference', 14500, 1, 38, 0.5, 11],
  ['Freya Lindholm', 'Snowflake', 'Negotiation', 'Partner', 31000, 2, 55, 2, 7],
  ['Mateo Silva', 'MongoDB', 'Negotiation', 'Referral', 19600, 3, 47, 4, 14],
  ['Leah Ortiz', 'Cloudflare', 'Negotiation', 'LinkedIn', 12800, 1, 42, 1, 5],
  // Proposal
  ['Lana Steiner', 'Notion', 'Proposal', 'LinkedIn', 16200, 1, 32, 1, 6],
  ['Demi Wilkinson', 'Stripe', 'Proposal', 'Website', 6750, 3, 29, 1, 18],
  ['Priya Nair', 'Atlassian', 'Proposal', 'Referral', 22000, 2, 41, 2, 12],
  ['Jonas Weber', 'Postman', 'Proposal', 'Website', 9100, 1, 37, 5, 16],
  ['Clara Jensen', 'Gong', 'Proposal', 'Events', 13300, 4, 45, 3, 20],
  ['Omar Haddad', 'Zoom', 'Proposal', 'Partner', 17500, 2, 50, 7, 9],
  // Qualified
  ['Olivia Rhye', 'Acme Inc.', 'Qualified', 'Website', 12400, 1, 12, 0.08, 8],
  ['Phoenix Baker', 'Linear', 'Qualified', 'Referral', 8900, 2, 20, 0.2, 14],
  ['Natali Craig', 'GitHub', 'Qualified', 'Partner', 9800, 3, 25, 3, 10],
  ['Remy Okafor', 'Superhuman', 'Qualified', 'LinkedIn', 7200, 1, 17, 1, 21],
  ['Zoe Lindqvist', 'Ghost', 'Qualified', 'Website', 5400, 4, 9, 2, 30],
  ['Caleb Rowe', 'Framer', 'Qualified', 'Referral', 10400, 2, 14, 4, 25],
  ['Ines Duarte', 'Pitch', 'Qualified', 'Events', 6800, 3, 33, 6, 35],
  ['Hugo Salter', 'Supabase', 'Qualified', 'Website', 8800, 1, 22, 1, 18],
  // New
  ['Aiden Brooks', 'Zendesk', 'New', 'Website', 6200, 4, 2, 0.5, 30],
  ['Sofia Reyes', 'Monday.com', 'New', 'LinkedIn', 5800, 3, 3, 1, 34],
  ['Liam Park', 'Gumroad', 'New', 'Email', 3400, 2, 5, 2, 40],
  ['Chloe Dubois', 'Lattice', 'New', 'Events', 8100, 1, 6, 3, 28],
  ['Ethan Cole', 'Clearbit', 'New', 'Referral', 4600, 3, 8, 4, 38],
  ['Nora Quinn', 'Descript', 'New', 'Website', 2900, 4, 1, 0.2],
  ['Victor Hale', 'Pipedrive', 'New', 'Email', 3800, 2, 10, 8],
  ['Tess Monroe', 'Calm', 'New', 'LinkedIn', 2400, 4, 12, 10],
  ['Arjun Mehta', 'Freshworks', 'New', 'Partner', 5200, 3, 15, 12],
  // Contacted
  ['Isla Fraser', 'Sketch', 'Contacted', 'Website', 4200, 1, 18, 3],
  ['Dev Patel', 'Hotjar', 'Contacted', 'LinkedIn', 3600, 2, 22, 5],
  ['Rosa Martins', 'Lemon Squeezy', 'Contacted', 'Events', 3100, 4, 26, 7],
  ['Wyatt Cho', 'Amplitude', 'Contacted', 'Referral', 7600, 3, 28, 2],
  ['Grace Liu', 'Fivetran', 'Contacted', 'Email', 4400, 1, 30, 9],
  ['Hamza Iqbal', 'Vanta', 'Contacted', 'Website', 5900, 2, 34, 6],
  ['Lucy Hart', 'Drift', 'Contacted', 'Conference', 4700, 4, 40, 11],
];

const LOST_REASONS = ['Chose a competitor', 'Budget cut', 'No decision', 'Timing not right', 'Missing a required feature'];
const NOTE_TEXT = [
  'Intro call went well. Decision maker is the VP of Operations; wants to see a live demo.',
  'Asked about SSO and data residency. Sent the security overview.',
  'Currently using spreadsheets plus a legacy tool. Pain point is reporting.',
  'Budget approved for this quarter. Procurement needs a signed quote.',
  'Champion is pushing internally; legal review expected next week.',
  'Compared us with two competitors; pricing is the main concern.',
];
const LEAD_NOTES = [
  'Inbound request via the contact form.',
  'Met at a conference booth; wants a follow-up demo.',
  'Referred by an existing customer.',
  'Evaluating tools for a team of 20-50 people.',
  'Interested in the annual plan.',
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function buildSeed(now = new Date()): Database {
  const rand = rng(2026);
  const t = now.getTime();
  const ago = (days: number) => new Date(t - days * DAY).toISOString();
  const ahead = (days: number) => new Date(t + days * DAY).toISOString();
  const leads: Lead[] = [];
  const deals: Deal[] = [];
  const activities: Activity[] = [];
  const notes: Note[] = [];
  const priorities: Priority[] = ['High', 'Medium', 'Low'];
  let a = 0;
  const act = (x: Omit<Activity, 'id'>) => activities.push({ id: `a${++a}`, ...x });

  ROWS.forEach(([name, company, status, source, value, o, createdAgoRaw, lastAgo, extra], i) => {
    const ownerId = `u${o}`;
    const closed = status === 'Won' || status === 'Lost';
    const cycle = 18 + Math.floor(rand() * 30);
    const createdAgo = closed ? (extra ?? 0) + cycle + Math.floor(rand() * 8) : createdAgoRaw;
    const id = `l${i + 1}`;
    const first = name.split(' ')[0].toLowerCase();
    const createdAt = ago(createdAgo);
    const lastActivityAt = ago(lastAgo);
    leads.push({
      id, name, company, status, source, value, ownerId, createdAt, lastActivityAt,
      updatedAt: lastActivityAt,
      email: `${first}@${slug(company)}.com`,
      phone: `+1 (555) 01${String(10 + ((i * 7) % 90)).padStart(2, '0')}-${String(1000 + ((i * 137) % 9000))}`,
      notes: LEAD_NOTES[i % LEAD_NOTES.length],
    });
    act({ actorId: ownerId, verb: 'added', subject: name, detail: 'as a new lead', leadId: id, createdAt });

    const hasDeal = extra !== undefined && status !== 'Contacted';
    if (hasDeal) {
      const did = `d${i + 1}`;
      const stage = status as Deal['stage'];
      const closedAt = closed ? ago(extra!) : undefined;
      deals.push({
        id: did, leadId: id, title: `${company} - ${name.split(' ')[0]}`, company, value, stage, ownerId,
        priority: priorities[Math.floor(rand() * 3)],
        expectedClose: closed ? closedAt! : ahead(extra!),
        lostReason: status === 'Lost' ? LOST_REASONS[i % LOST_REASONS.length] : undefined,
        createdAt: closed ? ago((extra ?? 0) + cycle) : ago(Math.max(createdAgo - 1, 0.1)),
        updatedAt: lastActivityAt, closedAt,
      });
      if (closed) {
        act({
          actorId: ownerId, verb: status === 'Won' ? 'closed' : 'lost', subject: name,
          detail: status === 'Won' ? 'as won' : 'deal', leadId: id, dealId: did, createdAt: closedAt!,
        });
      } else if (status !== 'New') {
        act({ actorId: ownerId, verb: 'moved', subject: name, detail: `to ${status}`, leadId: id, dealId: did, createdAt: lastActivityAt });
      }
    }
    if (i < 12) {
      notes.push({
        id: `n${i + 1}`, leadId: id, authorId: ownerId, createdAt: ago(Math.max(lastAgo, 0.3)),
        body: NOTE_TEXT[i % NOTE_TEXT.length],
      });
    }
  });

  // Hand-placed recent activity so the feed reads naturally.
  const L = (n: string) => leads.find((l) => l.name === n)!;
  const mins = (m: number) => new Date(t - m * 60_000).toISOString();
  act({ actorId: 'u1', verb: 'moved', subject: 'Olivia Rhye', detail: 'to Qualified', leadId: L('Olivia Rhye').id, createdAt: mins(10) });
  act({ actorId: 'u2', verb: 'added a note to', subject: 'Linear', leadId: L('Phoenix Baker').id, createdAt: mins(45) });
  act({ actorId: 'u2', verb: 'closed', subject: 'Candice Wu', detail: 'as won', leadId: L('Candice Wu').id, createdAt: mins(120) });
  act({ actorId: 'u1', verb: 'added', subject: '8 new leads', detail: 'via import', createdAt: mins(180) });

  // Tasks
  const tasks: Task[] = [];
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  let k = 0;
  const task = (title: string, ownerId: string, dayOffset: number, h: number, m: number, priority: Priority, leadName?: string, done = false, assignedById = 'u1') => {
    const lead = leadName ? L(leadName) : undefined;
    const deal = lead ? deals.find((d) => d.leadId === lead.id && d.stage !== 'Won' && d.stage !== 'Lost') : undefined;
    const dueAt = at(dayOffset, h, m);
    tasks.push({
      id: `t${++k}`, title, ownerId, assignedById, dueAt, priority, completed: done,
      completedAt: done ? new Date(Math.min(new Date(dueAt).getTime(), t - 60_000) ).toISOString() : undefined,
      leadId: lead?.id, dealId: deal?.id, createdAt: ago(6),
    });
  };
  // Today
  task('Follow up with Acme Inc.', 'u1', 0, 10, 30, 'High', 'Olivia Rhye');
  task('Send proposal to Notion', 'u1', 0, 12, 0, 'High', 'Lana Steiner');
  task('Prep demo environment for Cloudflare', 'u1', 0, 8, 30, 'Medium', 'Leah Ortiz', true);
  task('Update Figma contract notes', 'u1', 0, 9, 0, 'Low', 'Drew Cano', true);
  task('Email Superhuman pricing options', 'u1', 0, 9, 30, 'Medium', 'Remy Okafor', true);
  task('Log call with Supabase', 'u1', 0, 11, 0, 'Low', 'Hugo Salter', true);
  task('Call Phoenix Baker', 'u2', 0, 14, 0, 'Medium', 'Phoenix Baker');
  task('Review Q4 lead sources', 'u3', 0, 16, 30, 'Low');
  // Overdue
  task('Confirm revised quote with Stripe', 'u1', -1, 9, 0, 'High', 'Demi Wilkinson');
  task('Send case study to Linear', 'u2', -2, 15, 0, 'Medium', 'Phoenix Baker');
  task('Renewal paperwork for Dropbox', 'u3', -3, 11, 0, 'High', 'Candice Wu');
  // Tomorrow
  task('Prepare discovery questions for Figma', 'u1', 1, 11, 0, 'Medium', 'Drew Cano');
  task('Check in with Dropbox procurement', 'u2', 1, 15, 30, 'Low', 'Candice Wu');
  task('Schedule demo with Snowflake', 'u2', 1, 10, 0, 'High', 'Freya Lindholm');
  // Later
  task('Quarterly review with Atlassian', 'u3', 2, 14, 0, 'Medium', 'Priya Nair');
  task('Send pricing to Postman', 'u1', 3, 10, 0, 'Medium', 'Jonas Weber');
  task('Intro call with Zendesk', 'u4', 4, 13, 0, 'High', 'Aiden Brooks');
  task('Contract review with Zoom', 'u2', 6, 16, 0, 'High', 'Omar Haddad');
  task('Follow up with MongoDB', 'u3', 8, 9, 30, 'Medium', 'Mateo Silva');
  task('Plan Q1 territories', 'u1', 10, 15, 0, 'Low');
  task('Post-event follow-ups', 'u4', 13, 10, 0, 'Medium');
  // Completed earlier this week
  task('Send onboarding checklist to Dropbox', 'u2', -1, 14, 0, 'Medium', 'Candice Wu', true);
  task('Share security questionnaire with Gong', 'u4', -2, 10, 0, 'High', 'Clara Jensen', true);
  task('Book kickoff with Orca Labs', 'u2', -3, 13, 0, 'Medium', 'Orlando Diggs', true, 'u2');
  task('Qualify Ghost inbound request', 'u4', -4, 11, 0, 'Low', 'Zoe Lindqvist', true);
  task('Draft MSA for Snowflake', 'u2', -5, 16, 0, 'High', 'Freya Lindholm', true);
  task('Intro email to Sofia Reyes', 'u3', -6, 9, 0, 'Low', 'Sofia Reyes', true);
  // Make completion timestamps land on their due day for past tasks
  tasks.forEach((x) => { if (x.completed) x.completedAt = x.dueAt; });
  tasks.filter((x) => x.completed && new Date(x.dueAt).getTime() > t).forEach((x) => { x.completedAt = new Date(t - 3_600_000).toISOString(); });

  return {
    version: DB_VERSION,
    owners: OWNERS,
    leads, deals, tasks, notes,
    activities: activities.sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
    settings: {
      currentUserId: 'u1',
      workspace: {
        name: 'Northstar Demo Workspace', currency: 'USD', language: 'en-US', timeZone: 'auto',
        dateFormat: 'MMM d, yyyy', monthlyTarget: 40000,
      },
      probabilities: { New: 10, Qualified: 30, Proposal: 55, Negotiation: 75, Won: 100 },
      notifications: { emailUpdates: true, taskReminders: true, weeklySummary: false },
    },
  };
}
