import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://northstar:northstar@localhost:5432/northstar_test';

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const request = (await import('supertest')).default;

const app = createApp();
type Data = { owners: any[]; leads: any[]; deals: any[]; tasks: any[]; notes: any[]; activities: any[]; settings: any };

async function signup(email: string, sample = false, name = 'Test User') {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send({ name, email, password: 'password123', workspaceName: 'WS ' + email, sampleData: sample });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { agent, data: r.body.data as Data, me: r.body.data.settings.currentUserId as string };
}

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(false);
});
after(async () => { await pool.end(); });

describe('auth', () => {
  it('rejects unauthenticated requests', async () => {
    assert.equal((await request(app).get('/api/data')).status, 401);
    assert.equal((await request(app).post('/api/leads').send({})).status, 401);
  });
  it('registers, logs in, logs out, and validates input', async () => {
    const bad = await request(app).post('/api/auth/register').send({ name: '', email: 'nope', password: 'x', workspaceName: '' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.fields.password);
    const { agent } = await signup('auth1@example.com');
    assert.equal((await agent.get('/api/auth/me')).status, 200);
    const dup = await request(app).post('/api/auth/register').send({ name: 'X', email: 'AUTH1@example.com', password: 'password123', workspaceName: 'Dup' });
    assert.equal(dup.status, 409);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'auth1@example.com', password: 'wrong-password' })).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' })).status, 401);
    const login = await request(app).post('/api/auth/login').send({ email: 'AUTH1@example.com', password: 'password123' });
    assert.equal(login.status, 200);
    assert.match(String(login.headers['set-cookie']), /HttpOnly/);
    await agent.post('/api/auth/logout');
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });
  it('never returns password hashes', async () => {
    const { agent } = await signup('auth2@example.com');
    const body = JSON.stringify((await agent.get('/api/data')).body);
    assert.ok(!body.includes('password_hash') && !body.includes('$2'));
  });
  it('changes password only with the correct current password', async () => {
    const { agent } = await signup('auth3@example.com');
    assert.equal((await agent.post('/api/auth/change-password').send({ currentPassword: 'wrongwrong', newPassword: 'newpassword1' })).status, 400);
    assert.equal((await agent.post('/api/auth/change-password').send({ currentPassword: 'password123', newPassword: 'newpassword1' })).status, 200);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'auth3@example.com', password: 'newpassword1' })).status, 200);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'auth3@example.com', password: 'password123' })).status, 401);
  });
});

describe('leads, deals and tasks', () => {
  it('runs the full lead lifecycle with validation', async () => {
    const { agent, me } = await signup('crud1@example.com');
    const invalid = await agent.post('/api/leads').send({ name: '', company: 'X', ownerId: me, email: 'bad' });
    assert.equal(invalid.status, 400);
    assert.ok(invalid.body.fields.name && invalid.body.fields.email);

    const created = await agent.post('/api/leads').send({ name: 'Ada Lovelace', company: 'Analytical', ownerId: me, email: 'ada@analytical.com', value: 5000 });
    assert.equal(created.status, 201);
    const id = created.body.result.id;
    const lead = created.body.data.leads.find((l: any) => l.id === id);
    assert.equal(lead.status, 'New');
    assert.equal(lead.value, 5000);
    assert.equal(created.body.data.activities[0].subject, 'Ada Lovelace');

    // PATCH must not reset fields that were omitted
    const patched = await agent.patch(`/api/leads/${id}`).send({ company: 'Analytical Engines' });
    assert.equal(patched.status, 200);
    const after = patched.body.data.leads.find((l: any) => l.id === id);
    assert.equal(after.company, 'Analytical Engines');
    assert.equal(after.value, 5000);
    assert.equal(after.email, 'ada@analytical.com');

    const note = await agent.post(`/api/leads/${id}/notes`).send({ body: 'Called today' });
    assert.equal(note.body.data.notes.filter((n: any) => n.leadId === id).length, 1);

    assert.equal((await agent.patch(`/api/leads/${id}`).send({ ownerId: '00000000-0000-4000-8000-000000000000' })).status, 400);
    assert.equal((await agent.patch('/api/leads/not-a-uuid').send({ name: 'x' })).status, 400);
    assert.equal((await agent.patch('/api/leads/00000000-0000-4000-8000-000000000000').send({ name: 'x' })).status, 404);

    const del = await agent.post('/api/leads/bulk-delete').send({ ids: [id] });
    assert.equal(del.body.data.leads.length, 0);
    assert.equal(del.body.data.notes.length, 0);
  });

  it('keeps deals and lead status in sync and cascades deletes', async () => {
    const { agent, me } = await signup('crud2@example.com');
    const lead = (await agent.post('/api/leads').send({ name: 'Grace Hopper', company: 'Cobol Co', ownerId: me, value: 9000 })).body.result.id;
    const dealRes = await agent.post('/api/deals').send({ leadId: lead, title: 'Cobol deal', company: 'Cobol Co', value: 9000, stage: 'Qualified', ownerId: me, priority: 'High', expectedClose: new Date(Date.now() + 864e5 * 10).toISOString() });
    assert.equal(dealRes.status, 201);
    const dealId = dealRes.body.result.id;
    let d: Data = dealRes.body.data;
    assert.equal(d.leads[0].status, 'Qualified');

    d = (await agent.post(`/api/deals/${dealId}/move`).send({ stage: 'Won' })).body.data;
    assert.equal(d.deals[0].stage, 'Won');
    assert.ok(d.deals[0].closedAt);
    assert.equal(d.leads[0].status, 'Won');

    d = (await agent.post(`/api/deals/${dealId}/move`).send({ stage: 'Proposal' })).body.data;
    assert.equal(d.deals[0].closedAt, undefined);

    assert.equal((await agent.post(`/api/deals/${dealId}/lost`).send({ reason: '' })).status, 400);
    d = (await agent.post(`/api/deals/${dealId}/lost`).send({ reason: 'Budget cut' })).body.data;
    assert.equal(d.deals[0].stage, 'Lost');
    assert.equal(d.deals[0].lostReason, 'Budget cut');
    assert.equal(d.leads[0].status, 'Lost');
    // a Lost deal's stage is not changed by a plain edit
    d = (await agent.patch(`/api/deals/${dealId}`).send({ stage: 'New', value: 1234 })).body.data;
    assert.equal(d.deals[0].stage, 'Lost');
    assert.equal(d.deals[0].value, 1234);
    d = (await agent.post(`/api/deals/${dealId}/reopen`).send({ stage: 'New' })).body.data;
    assert.equal(d.deals[0].stage, 'New');
    assert.equal(d.deals[0].lostReason, undefined);

    const task = await agent.post('/api/tasks').send({ title: 'Call Grace', leadId: lead, dealId, ownerId: me, dueAt: new Date().toISOString(), priority: 'Medium' });
    assert.equal(task.status, 201);
    d = (await agent.delete(`/api/deals/${dealId}`)).body.data;
    assert.equal(d.deals.length, 0);
    assert.equal(d.tasks[0].dealId, undefined); // task survives, loses deal link
    d = (await agent.post('/api/leads/bulk-delete').send({ ids: [lead] })).body.data;
    assert.equal(d.tasks.length, 0); // task cascades with its lead
  });

  it('completes and reopens tasks, and rejects mismatched links', async () => {
    const { agent, me } = await signup('crud3@example.com');
    const l1 = (await agent.post('/api/leads').send({ name: 'A', company: 'A', ownerId: me })).body.result.id;
    const l2 = (await agent.post('/api/leads').send({ name: 'B', company: 'B', ownerId: me })).body.result.id;
    const deal = (await agent.post('/api/deals').send({ leadId: l1, title: 't', company: 'A', value: 1, stage: 'New', ownerId: me, priority: 'Low', expectedClose: new Date().toISOString() })).body.result.id;
    const bad = await agent.post('/api/tasks').send({ title: 'x', leadId: l2, dealId: deal, ownerId: me, dueAt: new Date().toISOString(), priority: 'Low' });
    assert.equal(bad.status, 400);
    const t = (await agent.post('/api/tasks').send({ title: 'x', leadId: l1, dealId: deal, ownerId: me, dueAt: new Date().toISOString(), priority: 'Low' })).body.result.id;
    let d: Data = (await agent.post(`/api/tasks/${t}/complete`).send({ completed: true })).body.data;
    assert.equal(d.tasks[0].completed, true);
    assert.ok(d.tasks[0].completedAt);
    d = (await agent.post(`/api/tasks/${t}/complete`).send({ completed: false })).body.data;
    assert.equal(d.tasks[0].completed, false);
    assert.equal(d.tasks[0].completedAt, undefined);
    d = (await agent.patch(`/api/tasks/${t}`).send({ title: 'renamed', priority: 'High' })).body.data;
    assert.equal(d.tasks[0].title, 'renamed');
    assert.equal(d.tasks[0].leadId, l1);
    d = (await agent.delete(`/api/tasks/${t}`)).body.data;
    assert.equal(d.tasks.length, 0);
  });

  it('bulk-updates owners/status and imports leads with de-duplication', async () => {
    const { agent, me } = await signup('crud4@example.com');
    const rows = [
      { name: 'One', company: 'C1', ownerId: me, email: 'one@c.com' },
      { name: 'Two', company: 'C2', ownerId: me, email: 'two@c.com', status: 'Qualified', value: 100 },
      { name: 'Dup', company: 'C3', ownerId: me, email: 'ONE@c.com' },
    ];
    const imp = await agent.post('/api/leads/import').send({ leads: rows });
    assert.deepEqual(imp.body.result, { imported: 2, skipped: 1 });
    const ids = imp.body.data.leads.map((l: any) => l.id);
    const upd = await agent.patch('/api/leads/bulk').send({ ids, patch: { status: 'Contacted' } });
    assert.ok(upd.body.data.leads.every((l: any) => l.status === 'Contacted'));
    assert.equal((await agent.patch('/api/leads/bulk').send({ ids, patch: {} })).status, 400);
    assert.equal((await agent.post('/api/leads/import').send({ leads: [{ name: '', company: 'x', ownerId: me }] })).status, 400);
  });
});

describe('multi-tenancy and roles', () => {
  it('isolates workspaces from each other', async () => {
    const a = await signup('tenant-a@example.com', true);
    const b = await signup('tenant-b@example.com');
    const leadOfA = a.data.leads[0].id;
    assert.equal(b.data.leads.length, 0);
    assert.equal((await b.agent.patch(`/api/leads/${leadOfA}`).send({ name: 'hacked' })).status, 404);
    assert.equal((await b.agent.post('/api/leads/bulk-delete').send({ ids: [leadOfA] })).body.result.deleted, 0);
    const dealOfA = a.data.deals[0].id;
    assert.equal((await b.agent.delete(`/api/deals/${dealOfA}`)).status, 404);
    // cannot assign to a user of another workspace
    assert.equal((await b.agent.post('/api/leads').send({ name: 'x', company: 'y', ownerId: a.me })).status, 400);
    const still = (await a.agent.get('/api/data')).body.data;
    assert.equal(still.leads.find((l: any) => l.id === leadOfA).name, a.data.leads[0].name);
  });

  it('enforces roles: viewers are read-only, only admins manage the workspace', async () => {
    const admin = await signup('roles-admin@example.com');
    const add = await admin.agent.post('/api/users').send({ name: 'Vic Viewer', email: 'vic@example.com', password: 'viewerpass1', role: 'Viewer' });
    assert.equal(add.status, 201);
    const rep = await admin.agent.post('/api/users').send({ name: 'Rita Rep', email: 'rita@example.com', password: 'reppass123', role: 'Sales rep' });
    const viewer = request.agent(app);
    assert.equal((await viewer.post('/api/auth/login').send({ email: 'vic@example.com', password: 'viewerpass1' })).status, 200);
    assert.equal((await viewer.get('/api/data')).status, 200);
    assert.equal((await viewer.post('/api/leads').send({ name: 'x', company: 'y', ownerId: admin.me })).status, 403);
    const repAgent = request.agent(app);
    await repAgent.post('/api/auth/login').send({ email: 'rita@example.com', password: 'reppass123' });
    const repMe = rep.body.data.owners.find((o: any) => o.email === 'rita@example.com').id;
    assert.equal((await repAgent.post('/api/leads').send({ name: 'ok', company: 'ok', ownerId: repMe })).status, 201);
    assert.equal((await repAgent.patch('/api/workspace').send({ name: 'Mine now' })).status, 403);
    assert.equal((await repAgent.post('/api/users').send({ name: 'x', email: 'x@x.com', password: 'password123' })).status, 403);
    assert.equal((await repAgent.post('/api/workspace/sample-data').send({})).status, 403);
    // admin can change a role; cannot change own
    assert.equal((await admin.agent.patch(`/api/users/${repMe}/role`).send({ role: 'Manager' })).status, 200);
    assert.equal((await admin.agent.patch(`/api/users/${admin.me}/role`).send({ role: 'Viewer' })).status, 400);
  });
});

describe('workspace, profile and sample data', () => {
  it('loads consistent sample data', async () => {
    const { data, me } = await signup('sample@example.com', true, 'Sam Sample');
    assert.equal(data.settings.workspace.isDemo, true);
    assert.equal(data.leads.length, 63);
    assert.equal(data.deals.length, 52);
    assert.equal(data.tasks.length, 27);
    assert.ok(data.owners.find((o: any) => o.id === me).name === 'Sam Sample');
    assert.equal(data.owners.filter((o: any) => !o.canSignIn).length, 3);
    // every deal points at a lead in the same workspace; won deals have close dates
    const leadIds = new Set(data.leads.map((l: any) => l.id));
    assert.ok(data.deals.every((d: any) => leadIds.has(d.leadId)));
    assert.ok(data.deals.filter((d: any) => d.stage === 'Won').every((d: any) => d.closedAt));
    assert.ok(data.tasks.some((t: any) => t.ownerId === me));
  });

  it('updates settings, profile and notification preferences', async () => {
    const { agent } = await signup('settings@example.com');
    assert.equal((await agent.patch('/api/workspace').send({ currency: 'usd' })).status, 400);
    const ws = await agent.patch('/api/workspace').send({ name: 'Renamed', currency: 'EUR', monthlyTarget: 12345, probabilities: { New: 20 } });
    assert.equal(ws.body.data.settings.workspace.currency, 'EUR');
    assert.equal(ws.body.data.settings.workspace.monthlyTarget, 12345);
    assert.equal(ws.body.data.settings.probabilities.New, 20);
    assert.equal(ws.body.data.settings.probabilities.Won, 100);
    assert.equal((await agent.patch('/api/workspace').send({ probabilities: { New: 150 } })).status, 400);
    const prof = await agent.patch('/api/me').send({ jobTitle: 'VP Sales' });
    assert.equal(prof.body.data.owners[0].jobTitle, 'VP Sales');
    assert.equal(prof.body.data.owners[0].name, 'Test User');
    assert.equal((await agent.patch('/api/me').send({ photo: 'http://evil.example/x.png' })).status, 400);
    const n = await agent.patch('/api/me/notifications').send({ weeklySummary: true });
    assert.deepEqual(n.body.data.settings.notifications, { emailUpdates: true, taskReminders: true, weeklySummary: true, smsReminders: false });
  });

  it('can reset to sample data and clear all data', async () => {
    const { agent } = await signup('reset@example.com');
    let d: Data = (await agent.post('/api/workspace/sample-data').send({})).body.data;
    assert.equal(d.leads.length, 63);
    d = (await agent.post('/api/workspace/sample-data').send({})).body.data; // idempotent
    assert.equal(d.leads.length, 63);
    assert.equal(d.owners.length, 4);
    d = (await agent.delete('/api/workspace/data')).body.data;
    assert.equal(d.leads.length + d.deals.length + d.tasks.length, 0);
    assert.equal(d.settings.workspace.isDemo, false);
  });

  it('returns JSON errors for malformed bodies and unknown routes', async () => {
    const { agent } = await signup('errors@example.com');
    const r = await agent.post('/api/leads').set('Content-Type', 'application/json').send('{bad json');
    assert.equal(r.status, 400);
    assert.equal((await agent.get('/api/nope')).status, 404);
  });
});
