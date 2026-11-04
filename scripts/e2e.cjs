// End-to-end smoke test. Usage:
//   npm run build && npm run preview &      (serves http://127.0.0.1:4173)
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
  const toastText = async () => (await p.locator('[role=status],[role=alert]').allTextContents()).join('|');

  console.log('Navigation');
  await p.goto(BASE + '/');
  await p.waitForURL('**/overview'); ok(p.url().endsWith('/overview'), 'root redirects to /overview');
  for (const [label, path] of [['Leads', '/leads'], ['Pipeline', '/pipeline'], ['Tasks', '/tasks'], ['Reports', '/reports'], ['Settings', '/settings'], ['Overview', '/overview']]) {
    await p.locator('aside nav a', { hasText: label }).click();
    ok(p.url().includes(path), `sidebar -> ${path}`);
    ok(await p.locator('aside nav a[aria-current=page]').innerText() === label, `active highlight = ${label}`);
  }
  ok(await p.getByText('Demo workspace').first().isVisible(), 'demo workspace label visible');
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
  await p.getByLabel('Email').fill('bad-email');
  await p.getByRole('button', { name: 'Add lead' }).last().click();
  ok(await p.getByText(/valid email/).isVisible(), 'validation: bad email');
  await p.getByLabel('Email').fill('zed@testco.com');
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
  fs.writeFileSync(TMP + '/import.csv', 'Full Name,Org,E-mail,Amount,Stage\nAnn Import,Importco,ann@importco.com,5000,Qualified\n,NoName,x@y.com,1,New\nBob Bad,Badco,not-an-email,10,New\nCy Dup,Dupco,olivia@acmeinc.com,10,New\n"Dee, Quoted",Quoteco,dee@quoteco.com,"$1,200",Weird\n');
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
  await p.getByLabel('Email').fill('maya@northstar.demo');
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
  const wonSum = await p.evaluate(() => JSON.parse(localStorage.getItem('northstar-crm:v1')).deals.filter((d) => d.stage === 'Won').reduce((a, d) => a + d.value, 0));
  await p.getByRole('tab', { name: 'Sales overview' }).click();
  const revText = await p.getByText('Total revenue').first().locator('..').locator('..').innerText();
  ok(revText.replace(/[^0-9]/g, '').startsWith(String(wonSum)), `report revenue (all time) equals sum of Won deals (${wonSum})`);
  // empty state: range 7d owner Sam with no data? force
  await p.getByLabel('Date range').selectOption('7d');
  await p.getByLabel('Owner').selectOption({ label: 'Sam Rivera' });
  await p.waitForTimeout(200);

  console.log('Persistence reset');
  await p.goto(BASE + '/settings?section=workspace');
  await p.getByRole('button', { name: 'Reset demo data' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await p.waitForTimeout(300);
  await p.goto(BASE + '/leads');
  ok((await p.locator('text=Showing').first().innerText()).includes('of 63'), 'reset restores 63 seed leads');

  console.log('\nConsole errors:', errs.length ? errs : 'none');
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
