// End-to-end test of the full stack. Usage:
//   npm run sink &                          # local SMTP (:1025) + SMS gateway (:1026) that record messages
//   (cd server && SMTP_HOST=127.0.0.1 SMTP_PORT=1025 APP_URL=http://127.0.0.1:4173 SMS_PROVIDER=bulksmsbd \
//      SMS_API_KEY=dev SMS_SENDER_ID=NSTAR SMS_API_URL=http://127.0.0.1:1026/sms AUTH_RATE_LIMIT=1000 npm run dev) &
//   npm run build && npm run preview &      # frontend on :4173, proxies /api to :3000
//   npm i -D playwright && node scripts/e2e.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const TMP = require('os').tmpdir();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  if (process.env.DEBUG_E2E) p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) console.log('   [api]', r.status(), r.request().method(), r.url().replace(BASE, '')); });
  // Every mutation is now a network round trip: after interactions, wait for in-flight API calls to finish.
  let inflight = 0;
  p.on('request', (r) => { if (r.url().includes('/api/')) inflight++; });
  p.on('requestfinished', (r) => { if (r.url().includes('/api/')) inflight--; });
  p.on('requestfailed', (r) => { if (r.url().includes('/api/')) inflight--; });
  const settle = async () => { await p.waitForTimeout(60); for (let i = 0; i < 60 && inflight > 0; i++) await p.waitForTimeout(50); await p.waitForTimeout(80); };
  const LocatorProto = Object.getPrototypeOf(p.getByRole('button'));
  for (const m of ['click', 'check', 'selectOption', 'dragTo', 'press', 'setInputFiles']) {
    const orig = LocatorProto[m];
    LocatorProto[m] = async function (...a) { const r = await orig.apply(this, a); await settle(); return r; };
  }
  const origPress = p.keyboard.press.bind(p.keyboard);
  p.keyboard.press = async (...a) => { const r = await origPress(...a); await settle(); return r; };
  const toastText = async () => (await p.locator('[role=status],[role=alert]').allTextContents()).join('|');

  console.log('Auth');
  const stamp = Date.now();
  const EMAIL = `maya.${stamp}@example.com`;
  const NEW_EMAIL = `maya.profile.${stamp}@example.com`; // the profile test changes the sign-in email
  await p.goto(BASE + '/leads');
  await p.waitForURL('**/login');
  ok(true, 'unauthenticated visit redirects to /login');
  await p.getByRole('link', { name: 'Create a workspace' }).click();
  await p.getByRole('button', { name: 'Create workspace' }).click();
  ok(await p.getByText('Enter your name.').isVisible(), 'register validation shown');
  await p.getByLabel('Your name').fill('Maya Chen');
  await p.getByLabel('Email').fill(EMAIL);
  await p.getByLabel('Password').fill('short');
  await p.getByLabel('Workspace name').fill('E2E Sales');
  await p.getByRole('button', { name: 'Create workspace' }).click();
  ok(await p.getByText('Use at least 8 characters.').first().isVisible(), 'register password rule');
  await p.getByLabel('Password').fill('password123');
  await p.getByRole('button', { name: 'Create workspace' }).click();
  await p.waitForURL('**/leads');
  ok(true, 'registered with sample data and returned to the page that was requested');
  await p.goto(BASE + '/');
  await p.waitForSelector('aside');

  console.log('Navigation');
  await p.waitForURL('**/overview'); ok(p.url().endsWith('/overview'), 'root redirects to /overview');
  for (const [label, path] of [['Leads', '/leads'], ['Pipeline', '/pipeline'], ['Tasks', '/tasks'], ['Reports', '/reports'], ['Settings', '/settings'], ['Overview', '/overview']]) {
    await p.locator('aside nav a', { hasText: label }).click();
    ok(p.url().includes(path), `sidebar -> ${path}`);
    ok(await p.locator('aside nav a[aria-current=page]').innerText() === label, `active highlight = ${label}`);
  }
  ok(await p.getByText('Sample data', { exact: true }).first().isVisible(), 'sample-data banner visible');
  ok((await p.locator('aside').innerText()).includes('Maya Chen'), 'sidebar profile Maya Chen');

  console.log('Overview drill-downs');
  await p.getByRole('link', { name: /Total leads/ }).click();
  ok(p.url().includes('/leads'), 'total leads card -> /leads');
  await p.goto(BASE + '/overview');
  await p.locator('a', { hasText: 'Referral' }).first().click();
  ok(p.url().includes('source=Referral'), 'source row -> filtered leads');
  const refRows = await p.locator('tbody tr').count();
  ok(refRows > 0, `filtered leads by Referral (${refRows} rows on page)`);
  await p.goto(BASE + '/overview');
  await p.locator('ol a').first().click();
  ok(p.url().includes('lead='), 'activity click opens lead record');
  ok(await p.getByTestId('drawer-name').isVisible(), 'lead drawer opened from activity');
  await p.keyboard.press('Escape');

  console.log('Leads CRUD');
  await p.goto(BASE + '/leads');
  const total0 = await p.locator('text=Showing').first().innerText();
  await p.getByRole('button', { name: 'Add lead' }).first().click();
  await p.getByRole('button', { name: 'Add lead' }).last().click();
  ok(await p.getByText('Enter the lead’s name.').isVisible(), 'validation: name required');
  await p.getByLabel('Full name').fill('Zed Tester');
  await p.getByLabel('Company', { exact: false }).first().fill('Testco');
  await p.getByLabel('Email', { exact: true }).fill('bad-email');
  await p.getByRole('button', { name: 'Add lead' }).last().click();
  ok(await p.getByText(/valid email/).isVisible(), 'validation: bad email');
  await p.getByLabel('Email', { exact: true }).fill('zed@testco.com');
  await p.getByLabel('Estimated value').fill('4321');
  await p.getByRole('button', { name: 'Add lead' }).last().click();
  ok((await toastText()).includes('Zed Tester added'), 'toast: lead added');
  await p.getByPlaceholder('Search leads').fill('zed@testco');
  ok(await p.locator('tbody tr').count() === 1, 'search finds new lead');
  await p.reload();
  await p.getByPlaceholder('Search leads').fill('Testco');
  ok(await p.locator('tbody tr').count() === 1, 'lead persists after refresh');
  // drawer + note + task
  await p.getByRole('button', { name: 'Zed Tester', exact: true }).click();
  ok(await p.getByTestId('drawer-name').innerText() === 'Zed Tester', 'drawer shows lead');
  await p.getByLabel('Add a note').fill('Called, wants a demo');
  await p.getByRole('button', { name: 'Add note' }).click();
  ok(await p.getByText('Called, wants a demo').isVisible(), 'note appears in drawer');
  await p.getByLabel('Change status').selectOption('Qualified');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ok(await p.locator('tbody tr').first().innerText().then((t) => t.includes('Qualified')), 'status change reflected in table');
  // edit
  await p.getByRole('button', { name: 'Edit Zed Tester' }).click();
  await p.getByLabel('Company', { exact: false }).first().fill('Testco Renamed');
  await p.getByRole('button', { name: 'Save changes' }).click();
  ok((await p.locator('tbody tr').first().innerText()).includes('Testco Renamed'), 'edit saved');
  // sort
  await p.getByPlaceholder('Search leads').fill('');
  await p.getByLabel('Sort by').selectOption('value:desc');
  const firstVal = await p.locator('tbody tr').first().locator('td').last().previous?.call?.(0).catch?.(() => '') ;
  const vals = await p.locator('tbody tr td:nth-last-child(2)').allInnerTexts();
  const nums = vals.map((v) => Number(v.replace(/[^0-9]/g, '')));
  ok(nums.every((n, i) => i === 0 || nums[i - 1] >= n), 'sort by value desc');
  // status tab
  await p.getByRole('tab', { name: /^Won/ }).click();
  ok(p.url().includes('status=Won'), 'status tab sets URL');
  await p.getByRole('tab', { name: /^All leads/ }).click();
  // pagination
  await p.getByRole('button', { name: 'Next page' }).click();
  ok((await p.locator('text=Showing').first().innerText()).includes('11–20'), 'pagination next page');
  await p.getByRole('button', { name: 'Page 1' }).click();
  // bulk
  await p.getByPlaceholder('Search leads').fill('Testco');
  await p.getByLabel('Select all leads on this page').check();
  await p.getByLabel('Assign owner to selected').selectOption({ label: 'Tom Cook' });
  await p.waitForTimeout(200);
  ok((await p.locator('tbody tr').first().innerText()).includes('Tom Cook'), 'bulk owner update');
  await p.getByLabel('Set status for selected').selectOption('Contacted');
  await p.waitForTimeout(200);
  ok((await p.locator('tbody tr').first().innerText()).includes('Contacted'), 'bulk status update');
  // export selected
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /^Export/ }).click()]);
  const csvPath = TMP + '/leads-export.csv'; await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  ok(csv.includes('Zed Tester') && csv.split('\r\n').length === 2, 'CSV export (selected rows only)');
  // delete w/ confirmation
  await p.getByRole('button', { name: 'Delete', exact: true }).click();
  ok(await p.getByRole('dialog').getByText('Delete 1 lead?').isVisible(), 'delete confirmation shown');
  await p.getByRole('button', { name: 'Cancel' }).click();
  ok(await p.locator('tbody tr').count() === 1, 'cancel keeps lead');
  await p.getByRole('button', { name: 'Delete', exact: true }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await p.waitForTimeout(200);
  ok(await p.getByText('No leads match your filters').isVisible(), 'lead deleted (empty state shown)');

  console.log('CSV import');
  await p.goto(BASE + '/leads');
  await p.getByRole('button', { name: 'Import' }).click(); const dlg = p.getByRole('dialog');
  fs.writeFileSync(TMP + '/import.csv', 'Full Name,Org,E-mail,Amount,Stage\nAnn Import,Importco,ann@importco.com,5000,Qualified\n,NoName,x@y.com,1,New\nBob Bad,Badco,not-an-email,10,New\nCy Dup,Dupco,olivia@acmeinc.example,10,New\n"Dee, Quoted",Quoteco,dee@quoteco.com,"$1,200",Weird\n');
  await p.getByLabel('CSV file').setInputFiles(TMP + '/import.csv');
  await p.getByText('Match each Northstar field').waitFor(); ok(true, 'mapping step shown');
  await dlg.locator('#map-company').selectOption({ label: 'Org' });
  await dlg.locator('#map-name').selectOption({ label: 'Full Name' });
  await dlg.getByLabel('Email').selectOption({ label: 'E-mail' });
  await dlg.getByLabel('Estimated value').selectOption({ label: 'Amount' });
  await dlg.getByLabel('Status').selectOption({ label: 'Stage' });
  await p.getByRole('button', { name: 'Validate' }).click();
  const summary = await p.getByRole('dialog').innerText();
  ok(summary.includes('Ready to import') && /2\s*Ready/.test(summary.replace(/\n/g, ' ')) , 'validation: 2 valid rows');
  ok(summary.includes('Row 3') && summary.includes('Row 4') && summary.includes('duplicate email'), 'validation lists bad rows');
  await p.getByRole('button', { name: /Import 2 leads/ }).click();
  await p.getByPlaceholder('Search leads').fill('quoteco');
  ok((await p.locator('tbody tr').first().innerText()).includes('$1,200'), 'imported quoted row with parsed value');

  console.log('Pipeline');
  await p.goto(BASE + '/pipeline');
  const colCount = async (s) => Number((await p.locator(`[data-stage=${s}] h2 + p`).innerText()).match(/(\d+) deal/)[1]);
  const [n0, q0] = [await colCount('New'), await colCount('Qualified')];
  const openVal0 = await p.getByText('Open pipeline value').locator('..').locator('..').innerText();
  const card = p.locator('[data-stage=New] [role=button]').first();
  const cardName = (await card.innerText()).split('\n')[0];
  await card.dragTo(p.locator('[data-stage=Qualified]'));
  await p.waitForTimeout(300);
  ok(await colCount('New') === n0 - 1 && await colCount('Qualified') === q0 + 1, 'drag & drop moves deal between columns');
  ok((await toastText()).includes('moved to Qualified'), 'toast on move');
  await p.reload();
  ok(await colCount('Qualified') === q0 + 1, 'move persists after refresh');
  await p.goto(BASE + '/leads?q=');
  await p.getByPlaceholder('Search leads').fill(cardName);
  ok((await p.locator('tbody tr').first().innerText()).includes('Qualified'), 'lead status synced from pipeline move');
  // keyboard move
  await p.goto(BASE + '/pipeline');
  await p.locator('[data-stage=Qualified] [role=button]').first().focus();
  const q1 = await colCount('Qualified');
  await p.keyboard.press('Alt+ArrowRight');
  await p.waitForTimeout(200);
  ok(await colCount('Qualified') === q1 - 1, 'keyboard Alt+Arrow moves deal');
  // filters
  await p.getByLabel('Filter by owner').selectOption({ label: 'Tom Cook' });
  const names = await p.locator('[data-stage] [role=button]').allInnerTexts();
  ok(names.length > 0 && names.every((t) => t.includes('Tom')), 'owner filter');
  await p.getByLabel('Filter by owner').selectOption('');
  await p.getByLabel('Filter by priority').selectOption('High');
  ok((await p.locator('[data-stage] [role=button]').allInnerTexts()).every((t) => t.includes('High')), 'priority filter');
  await p.getByLabel('Filter by priority').selectOption('');
  // add deal
  await p.getByRole('button', { name: 'Add deal' }).first().click();
  await p.getByRole('button', { name: 'Add deal' }).last().click();
  ok(await p.getByText('Choose the lead this deal belongs to.').isVisible(), 'deal validation');
  await p.getByRole('dialog').locator('select').first().selectOption({ index: 1 });
  await p.getByRole('dialog').locator('input[type=number]').fill('7777');
  await p.getByRole('button', { name: 'Add deal' }).last().click();
  ok((await toastText()).includes('created'), 'deal created');
  // Mark lost via details
  await p.locator('[data-stage=Negotiation] [role=button]').first().click();
  await p.getByRole('button', { name: 'Mark as lost' }).click();
  await p.getByLabel('Why was this deal lost?').fill('Budget cut');
  const negBefore = await colCount('Negotiation');
  await p.getByRole('button', { name: 'Confirm lost' }).click();
  await p.waitForTimeout(200);
  ok(await colCount('Negotiation') === negBefore - 1, 'mark lost removes from open board');
  // list view
  await p.getByRole('radio', { name: 'List' }).click();
  await p.getByLabel('Filter by stage').selectOption('Lost');
  ok((await p.locator('tbody tr').allInnerTexts()).some((t) => t.includes('Lost')), 'list view shows Lost deals');

  console.log('Weighted value / settings');
  await p.goto(BASE + '/pipeline');
  const wBefore = await p.getByText('Weighted value').locator('..').locator('..').innerText();
  await p.goto(BASE + '/settings?section=workspace');
  await p.getByLabel('New (%)').fill('90');
  await p.getByLabel('Currency').selectOption('EUR');
  await p.getByRole('button', { name: 'Save workspace' }).click();
  await p.goto(BASE + '/pipeline');
  const wAfter = await p.getByText('Weighted value').locator('..').locator('..').innerText();
  ok(wBefore !== wAfter && wAfter.includes('€'), 'probability + currency settings change weighted value & symbol');
  await p.goto(BASE + '/settings?section=profile');
  await p.getByLabel('Job title').fill('VP Sales');
  await p.getByLabel('Email').fill('nope');
  await p.getByRole('button', { name: 'Save profile' }).click();
  ok(await p.getByText('Enter a valid email address.').isVisible(), 'profile email validation');
  await p.getByLabel('Email').fill(NEW_EMAIL);
  await p.getByRole('button', { name: 'Save profile' }).click();
  await p.reload();
  ok((await p.locator('aside').innerText()).includes('VP Sales'), 'profile persists; sidebar updated');
  await p.goto(BASE + '/settings?section=integrations');
  await p.getByRole('button', { name: 'Set up' }).first().click();
  ok((await p.getByRole('dialog').innerText()).includes('Requires setup'), 'integration shows Requires setup, no fake success');
  await p.keyboard.press('Escape');
  await p.goto(BASE + '/settings?section=security');
  ok((await p.locator('main').innerText()).includes('Not enabled'), 'security: 2FA not enabled');
  await p.goto(BASE + '/settings?section=notifications');
  await p.getByRole('switch', { name: 'Weekly summary' }).click();
  await p.reload();
  ok(await p.getByRole('switch', { name: 'Weekly summary' }).getAttribute('aria-checked') === 'true', 'notification pref persists');

  console.log('Tasks');
  await p.goto(BASE + '/tasks');
  const dueBefore = Number((await p.getByText('Due today', { exact: true }).locator('..').locator('..').innerText()).match(/Due today\s*(\d+)/)[1]);
  await p.getByRole('checkbox', { name: /Complete task: Follow up with Acme/ }).click();
  await p.waitForTimeout(200);
  const dueAfter = Number((await p.getByText('Due today', { exact: true }).first().locator('..').locator('..').innerText()).match(/Due today\s*(\d+)/)[1]);
  ok(dueAfter === dueBefore - 1, 'completing task updates summary');
  ok((await p.getByText('5 of 6').count()) > 0 || (await p.locator('main').innerText()).includes('5 of 6'), 'daily progress updated to 5 of 6');
  await p.getByRole('tab', { name: /^Completed/ }).click();
  await p.getByRole('checkbox', { name: /Reopen task: Follow up with Acme/ }).click();
  await p.waitForTimeout(200);
  ok(await p.getByRole('checkbox', { name: /Reopen task: Follow up with Acme/ }).count() === 0, 'reopen moves it out of Completed');
  await p.getByRole('tab', { name: /^All tasks/ }).click();
  await p.getByRole('button', { name: 'Add task' }).first().click();
  await p.getByRole('button', { name: 'Add task' }).last().click();
  ok(await p.getByText('Enter a task title.').isVisible(), 'task validation');
  await p.getByLabel('Title').fill('E2E task');
  await p.getByRole('button', { name: 'Add task' }).last().click();
  ok(await p.getByText('E2E task').first().isVisible(), 'task added');
  await p.reload();
  ok(await p.getByText('E2E task').first().isVisible(), 'task persists');
  await p.getByLabel('Filter by priority').selectOption('Low');
  ok((await p.locator('section[aria-label] li').allInnerTexts()).every((t) => !t.includes('High')), 'priority filter on tasks');
  await p.getByLabel('Filter by priority').selectOption('');
  await p.getByRole('button', { name: 'Delete task: E2E task' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  ok(await p.getByText('E2E task').count() === 0, 'task deleted after confirm');
  await p.getByRole('button', { name: /Wednesday, November 4/ }).first().click().catch(() => {});

  console.log('Reports');
  await p.goto(BASE + '/reports');
  const rev90 = await p.getByText('Total revenue').first().locator('..').locator('..').innerText();
  await p.getByLabel('Date range').selectOption('7d');
  await p.getByLabel('Owner').selectOption({ label: 'Sam Rivera' });
  await p.waitForTimeout(300);
  ok((await p.locator('main').innerText()).length > 0, 'report with narrow filter renders');
  await p.getByLabel('Date range').selectOption('all');
  await p.getByLabel('Owner').selectOption('');
  await p.getByRole('tab', { name: 'Lead analytics' }).click();
  ok(await p.getByText('New leads over time').isVisible(), 'lead analytics tab');
  await p.getByRole('tab', { name: 'Team performance' }).click();
  ok(await p.getByText('Revenue by rep').isVisible(), 'team tab');
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export CSV' }).click()]);
  await dl2.saveAs(TMP + '/report.csv');
  const rc = fs.readFileSync(TMP + '/report.csv', 'utf8');
  ok(rc.includes('Total revenue') && rc.includes('Funnel stage') && rc.includes('Maya Chen'), 'report CSV export');
  // consistency: revenue all-time = sum of won deals
  const wonSum = await p.evaluate(async () => (await (await fetch('/api/data')).json()).data.deals.filter((d) => d.stage === 'Won').reduce((a, d) => a + d.value, 0));
  await p.getByRole('tab', { name: 'Sales overview' }).click();
  const revText = await p.getByText('Total revenue').first().locator('..').locator('..').innerText();
  ok(revText.replace(/[^0-9]/g, '').startsWith(String(wonSum)), `report revenue (all time) equals sum of Won deals (${wonSum})`);
  // empty state: range 7d owner Sam with no data? force
  await p.getByLabel('Date range').selectOption('7d');
  await p.getByLabel('Owner').selectOption({ label: 'Sam Rivera' });
  await p.waitForTimeout(200);

  console.log('Security, team and sample data');
  await p.goto(BASE + '/settings?section=security');
  await p.getByLabel('Current password').fill('wrong-wrong');
  await p.getByLabel('New password', { exact: true }).fill('newpassword9');
  await p.getByLabel('Confirm new password').fill('newpassword9');
  await p.getByRole('button', { name: 'Change password' }).click();
  await p.waitForTimeout(400);
  ok((await toastText()).includes('current password is incorrect'), 'wrong current password rejected by server');
  await p.getByLabel('Current password').fill('password123');
  await p.getByRole('button', { name: 'Change password' }).click();
  await p.waitForTimeout(400);
  ok((await toastText()).includes('Password changed'), 'password changed');
  await p.goto(BASE + '/settings?section=team');
  await p.getByRole('button', { name: 'Add with password' }).click();
  await p.getByRole('dialog').getByLabel('Full name').fill('Vic Viewer');
  await p.getByRole('dialog').getByLabel('Email').fill(`vic.${stamp}@example.com`);
  await p.getByRole('dialog').getByLabel('Role').selectOption('Viewer');
  await p.getByRole('dialog').getByLabel('Initial password').fill('viewerpass1');
  await p.getByRole('dialog').getByRole('button', { name: 'Add member' }).click();
  await p.waitForTimeout(400);
  ok(await p.getByText('Vic Viewer').first().isVisible(), 'member added');
  await p.getByLabel('Role for Tom Cook').selectOption('Manager');
  await p.waitForTimeout(300);
  ok(await p.getByLabel('Role for Tom Cook').inputValue() === 'Manager', 'role change persisted');

  console.log('Sign out / sign in / roles');
  await p.getByRole('button', { name: 'Sign out' }).first().click();
  await p.waitForURL('**/login');
  ok(true, 'sign out returns to /login');
  await p.goto(BASE + '/leads');
  await p.waitForURL('**/login');
  ok(true, 'protected page redirects after sign out');
  await p.getByLabel('Email').fill(NEW_EMAIL);
  await p.getByLabel('Password').fill('password123');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForTimeout(500);
  ok(await p.getByText('Incorrect email or password.').isVisible(), 'old password no longer works after change');
  await p.getByLabel('Password').fill('newpassword9');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForSelector('aside');
  ok(true, 'sign in with new password');
  await p.getByRole('button', { name: 'Sign out' }).first().click();
  await p.waitForURL('**/login');
  await p.getByLabel('Email').fill(`vic.${stamp}@example.com`);
  await p.getByLabel('Password').fill('viewerpass1');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForSelector('aside');
  await p.goto(BASE + '/leads');
  await p.getByRole('button', { name: 'Add lead' }).first().click();
  await p.getByLabel('Full name').fill('Blocked Lead');
  await p.getByLabel('Company', { exact: false }).first().fill('Nope');
  await p.getByRole('button', { name: 'Add lead' }).last().click();
  await p.waitForTimeout(400);
  ok((await toastText()).includes('read-only'), 'viewer is blocked from writing (server 403 shown)');
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Sign out' }).first().click();
  await p.waitForURL('**/login');
  await p.getByLabel('Email').fill(NEW_EMAIL);
  await p.getByLabel('Password').fill('newpassword9');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForSelector('aside');

  console.log('Email + SMS');
  const SINK = 'http://127.0.0.1:1027';
  const sink = async () => (await fetch(SINK)).json();
  const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await p.waitForTimeout(250); } return null; };
  await fetch(SINK + '/reset', { method: 'DELETE' });

  // Profile phone -> SMS reminders toggle
  await p.goto(BASE + '/settings?section=notifications');
  ok(await p.getByRole('switch', { name: 'Task reminders (SMS)' }).isDisabled(), 'SMS reminders are disabled until a mobile number is set');
  await p.goto(BASE + '/settings?section=profile');
  await p.getByLabel('Mobile number').fill('+14155552671');
  ok((await p.locator('main').innerText()).includes('Not a Bangladeshi mobile number'), 'non-BD number is flagged');
  await p.getByLabel('Mobile number').fill('01712-345678');
  ok((await p.locator('main').innerText()).includes('+880 1712-345678'), 'BD number normalised in the hint');
  await p.getByRole('button', { name: 'Save profile' }).click();
  await p.goto(BASE + '/settings?section=notifications');
  await p.getByRole('switch', { name: 'Task reminders (SMS)' }).click();
  ok(await p.getByRole('switch', { name: 'Task reminders (SMS)' }).getAttribute('aria-checked') === 'true', 'SMS reminders can be enabled with a BD number');
  ok((await p.locator('main').innerText()).includes('Email delivery is set up on this server'), 'notifications page shows live email status');

  // Integrations: live status, test sends, message log
  await p.goto(BASE + '/settings?section=integrations');
  await p.getByText('Email (SMTP)').waitFor();
  ok((await p.getByText('Connected', { exact: true }).count()) === 2, 'email and SMS show as Connected');
  await p.getByRole('button', { name: 'Send test' }).first().click();
  await p.getByRole('dialog').getByRole('textbox').fill('bad');
  await p.getByRole('dialog').getByRole('button', { name: 'Send test' }).click();
  ok(await p.getByText('Enter a valid email address.').isVisible(), 'test email validation');
  await p.getByRole('dialog').getByRole('textbox').fill('tester@example.com');
  await p.getByRole('dialog').getByRole('button', { name: 'Send test' }).click();
  ok(await p.getByRole('dialog').getByText(/accepted/).isVisible(), 'test email accepted by SMTP server');
  await p.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  ok(!!(await until(async () => (await sink()).emails.find((m) => m.subject === 'Northstar test email'))), 'test email really arrived at the SMTP server');
  await p.getByRole('button', { name: 'Send test' }).last().click();
  await p.getByRole('dialog').getByRole('textbox').fill('12345');
  await p.getByRole('dialog').getByRole('button', { name: 'Send test' }).click();
  ok((await p.getByRole('dialog').innerText()).includes('Bangladeshi mobile'), 'SMS test rejects non-BD number');
  await p.getByRole('dialog').getByRole('textbox').fill('01912345678');
  await p.getByRole('dialog').getByRole('button', { name: 'Send test' }).click();
  ok(await p.getByRole('dialog').getByText(/accepted/).isVisible(), 'test SMS accepted by gateway');
  await p.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  ok((await sink()).sms.some((s) => s.number === '8801912345678'), 'test SMS reached the gateway with normalised number');
  ok((await p.getByText('Message log').isVisible()) && (await p.locator('table tbody tr').count()) >= 2, 'message log lists sent messages');

  // Messaging a lead
  await p.goto(BASE + '/leads');
  await p.getByRole('button', { name: 'Add lead' }).first().click();
  await p.getByLabel('Full name').fill('Sms Target');
  await p.getByLabel('Company', { exact: false }).first().fill('Dhaka Co');
  await p.getByLabel('Email', { exact: true }).fill('sms.target@dhakaco.example');
  await p.getByLabel('Phone').fill('01712-345678');
  await p.getByRole('button', { name: 'Add lead' }).last().click();
  await p.getByPlaceholder('Search leads').fill('Sms Target');
  await p.getByRole('button', { name: 'Sms Target', exact: true }).click();
  await p.getByRole('button', { name: 'SMS', exact: true }).click();
  await p.getByRole('dialog').last().getByRole('button', { name: 'Send SMS' }).last().click();
  ok(await p.getByText('Enter a message.').isVisible(), 'SMS message required');
  await p.getByRole('dialog').last().getByLabel('Message').fill('Assalamu alaikum, আপনার ডেমো নিশ্চিত হয়েছে।');
  ok((await p.getByRole('dialog').last().innerText()).includes('Unicode'), 'SMS dialog explains Bangla segment length');
  await p.getByRole('dialog').last().getByRole('button', { name: 'Send SMS' }).last().click();
  ok(!!(await until(async () => (await sink()).sms.find((s) => s.number === '8801712345678' && s.message.includes('ডেমো')))), 'SMS to lead delivered to gateway with Bangla text intact');
  ok(!!(await until(async () => (await p.getByText('Sent', { exact: true }).count()) > 0)), 'message history shows Sent');
  await p.getByRole('button', { name: 'Email', exact: true }).click();
  await p.getByRole('dialog').last().getByLabel('Subject').fill('Your demo is booked');
  await p.getByRole('dialog').last().getByLabel('Message').fill('Hi, see you Sunday.');
  await p.getByRole('dialog').last().getByRole('button', { name: 'Send email' }).click();
  ok(!!(await until(async () => (await sink()).emails.find((m) => m.to.includes('sms.target@dhakaco.example') && m.subject === 'Your demo is booked'))), 'email to lead delivered over SMTP');
  await p.keyboard.press('Escape');
  // do-not-contact blocks both channels
  await p.getByRole('button', { name: 'Edit Sms Target' }).click();
  await p.getByLabel('Do not contact').check();
  await p.getByRole('button', { name: 'Save changes' }).click();
  await p.getByRole('button', { name: 'Sms Target', exact: true }).click();
  ok(await p.getByRole('button', { name: 'SMS', exact: true }).isDisabled() && await p.getByRole('button', { name: 'Email', exact: true }).isDisabled(), 'do-not-contact disables email and SMS');
  await p.keyboard.press('Escape');
  // a sample lead (non-BD number) cannot be texted
  await p.getByPlaceholder('Search leads').fill('Olivia');
  await p.getByRole('button', { name: 'Olivia Rhye', exact: true }).click();
  ok(await p.getByRole('button', { name: 'SMS', exact: true }).isDisabled(), 'SMS disabled for a non-Bangladeshi number');
  await p.keyboard.press('Escape');

  // Invitations
  await p.goto(BASE + '/settings?section=team');
  await p.getByRole('button', { name: 'Invite by email' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Create invitation' }).click();
  ok(await p.getByText('Enter a valid email address.').isVisible(), 'invite validation');
  await p.getByRole('dialog').getByLabel('Email').fill(`invitee.${stamp}@example.com`);
  await p.getByRole('dialog').getByLabel('Role').selectOption('Manager');
  await p.getByRole('dialog').getByRole('button', { name: 'Create invitation' }).click();
  ok(await p.getByRole('dialog').getByText(/on its way/).isVisible(), 'invite reports the email is on its way');
  const inviteLink = await p.getByRole('dialog').locator('input[readonly]').inputValue();
  await p.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  ok((await p.locator('main').innerText()).includes(`invitee.${stamp}@example.com`), 'pending invitation listed');
  const invMail = await until(async () => (await sink()).emails.find((m) => m.to.includes(`invitee.${stamp}@example.com`)));
  ok(!!invMail && invMail.text.includes(inviteLink), 'invitation email contains the same link');
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const q = await ctx2.newPage();
  await q.goto(inviteLink);
  await q.getByText(/invited you as Manager/).waitFor();
  ok(true, 'invite page shows workspace and role');
  await q.getByRole('button', { name: 'Accept invitation' }).click();
  ok(await q.getByText('Enter your name.').isVisible(), 'accept validation');
  await q.getByLabel('Your name').fill('Invited Person');
  await q.getByLabel('Choose a password').fill('invitedpass1');
  await q.getByRole('button', { name: 'Accept invitation' }).click();
  await q.waitForSelector('aside');
  ok((await q.locator('aside').innerText()).includes('Invited Person'), 'invited user joined and is signed in');
  const ctx2b = await b.newContext();
  const q2 = await ctx2b.newPage();
  await q2.goto(inviteLink);
  await q2.getByText('Invitation not valid').waitFor();
  ok(true, 'invitation link is single use');
  await ctx2.close(); await ctx2b.close();

  // Password reset by email
  const ctx3 = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const r = await ctx3.newPage();
  await r.goto(BASE + '/login');
  await r.getByRole('link', { name: 'Forgot password?' }).click();
  await r.getByLabel('Email').fill('nobody@example.com');
  await r.getByRole('button', { name: 'Send reset link' }).click();
  ok(await r.getByText('Check your email').isVisible(), 'unknown email gets the same neutral answer');
  await fetch(SINK + '/reset', { method: 'DELETE' });
  await r.goto(BASE + '/forgot-password');
  await r.getByLabel('Email').fill(NEW_EMAIL);
  await r.getByRole('button', { name: 'Send reset link' }).click();
  ok(await r.getByText('Check your email').isVisible(), 'reset requested');
  const resetMail = await until(async () => (await sink()).emails.find((m) => m.to.includes(NEW_EMAIL) && /Reset your/.test(m.subject)));
  ok(!!resetMail, 'reset email arrived');
  const resetUrl = resetMail.text.match(/http:\/\/[^\s]+reset-password\?token=[A-Za-z0-9_-]+/)[0];
  await r.goto(resetUrl);
  await r.getByLabel(/^New password/).fill('resetpass99');
  await r.getByLabel(/^Confirm new password/).fill('different99');
  await r.getByRole('button', { name: 'Update password' }).click();
  ok(await r.getByText('Passwords do not match.').isVisible(), 'reset confirm mismatch');
  await r.getByLabel(/^Confirm new password/).fill('resetpass99');
  await r.getByRole('button', { name: 'Update password' }).click();
  ok(await r.getByText('Password updated').isVisible(), 'password reset done');
  await r.getByRole('button', { name: 'Go to sign in' }).click();
  await r.getByLabel('Email').fill(NEW_EMAIL);
  await r.getByLabel('Password').fill('resetpass99');
  await r.getByRole('button', { name: 'Sign in' }).click();
  await r.waitForSelector('aside');
  ok(true, 'can sign in with the reset password');
  await r.goto(resetUrl);
  await r.getByLabel(/^New password/).fill('another-pass1');
  await r.getByLabel(/^Confirm new password/).fill('another-pass1');
  await r.getByRole('button', { name: 'Update password' }).click();
  ok(await r.getByText(/invalid or has expired/).isVisible(), 'reset link cannot be reused');
  await ctx3.close();

  // Task reminder by the real background scheduler (runs once a minute)
  console.log('  ... waiting for the scheduler to send a task reminder (up to ~70s)');
  await fetch(SINK + '/reset', { method: 'DELETE' });
  await p.evaluate(async () => {
    const d = (await (await fetch('/api/data')).json()).data;
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'E2E reminder task', ownerId: d.settings.currentUserId, dueAt: new Date(Date.now() + 10 * 60_000).toISOString(), priority: 'High' }) });
  });
  const remEmail = await until(async () => (await sink()).emails.find((m) => /Reminder: E2E reminder task/.test(m.subject)), 75000);
  ok(!!remEmail, 'scheduler sent the task reminder email');
  const remSms = await until(async () => (await sink()).sms.find((s) => /E2E reminder task/.test(s.message)), 10000);
  ok(!!remSms && remSms.number === '8801712345678', 'scheduler sent the task reminder SMS to the profile number');

  console.log('Replace / clear data');
  await p.goto(BASE + '/settings?section=workspace');
  await p.getByRole('button', { name: 'Delete all leads, deals and tasks' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
  await p.waitForTimeout(500);
  await p.goto(BASE + '/leads');
  ok(await p.getByText('No leads yet').isVisible(), 'cleared workspace shows empty state');
  await p.goto(BASE + '/overview');
  ok(await p.getByText('Nothing due today').isVisible(), 'overview handles empty workspace');
  await p.goto(BASE + '/reports');
  ok(await p.getByText('No data for this period').isVisible(), 'reports handle empty workspace');
  await p.goto(BASE + '/pipeline');
  ok(await p.locator('[data-stage]').count() === 5, 'pipeline renders empty columns');
  await p.goto(BASE + '/settings?section=workspace');
  await p.getByRole('button', { name: 'Replace with sample data' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Replace' }).click();
  await p.waitForTimeout(800);
  await p.goto(BASE + '/leads');
  ok((await p.locator('text=Showing').first().innerText()).includes('of 63'), 'sample data restored (63 leads)');

  console.log('\nConsole errors:', errs.length ? errs : 'none');
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
