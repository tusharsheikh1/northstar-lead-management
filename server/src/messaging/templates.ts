import { config } from '../config.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface Rendered { subject: string; text: string; html: string }

function layout(title: string, bodyHtml: string, footer = 'You are receiving this because of your notification settings in Northstar CRM.') {
  return `<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:Inter,Arial,sans-serif;color:#0b1437">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e6e8f0;border-radius:12px">
<tr><td style="padding:24px 28px 0;font-size:18px;font-weight:700;color:#4169E1">&#10022; Northstar</td></tr>
<tr><td style="padding:12px 28px 24px"><h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e6e8f0;font-size:12px;color:#5b6580">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#4169E1;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">${esc(label)}</a></p><p style="font-size:12px;color:#5b6580">Or paste this link into your browser:<br>${esc(href)}</p>`;
const p = (s: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(s)}</p>`;

export const link = (path: string) => `${config.appUrl}${path}`;

export function inviteEmail(inviter: string, workspace: string, role: string, url: string): Rendered {
  const subject = `${inviter} invited you to ${workspace} on Northstar`;
  const text = `${inviter} invited you to join "${workspace}" on Northstar CRM as ${role}.\n\nAccept the invitation: ${url}\n\nThis link expires in 7 days. If you were not expecting this, you can ignore this email.`;
  return { subject, text, html: layout(`Join ${workspace}`, p(`${inviter} invited you to join “${workspace}” on Northstar CRM as ${role}.`) + button(url, 'Accept invitation') + p('This link expires in 7 days. If you were not expecting this, you can ignore this email.'), 'Invitation sent from Northstar CRM.') };
}

export function passwordResetEmail(url: string): Rendered {
  const subject = 'Reset your Northstar password';
  const text = `We received a request to reset your Northstar password.\n\nChoose a new password: ${url}\n\nThis link expires in 1 hour and can be used once. If you did not request it, you can ignore this email - your password will not change.`;
  return { subject, text, html: layout('Reset your password', p('We received a request to reset your Northstar password.') + button(url, 'Choose a new password') + p('This link expires in 1 hour and can be used once. If you did not request it, you can ignore this email — your password will not change.'), 'Security email from Northstar CRM.') };
}

export function assignedEmail(actor: string, what: 'lead' | 'task' | 'deal', title: string, url: string): Rendered {
  const subject = `${actor} assigned you a ${what}: ${title}`;
  const text = `${actor} assigned you a ${what}: ${title}\n\nOpen it: ${url}`;
  return { subject, text, html: layout(`New ${what} assigned to you`, p(`${actor} assigned you a ${what}: ${title}`) + button(url, `Open ${what}`)) };
}

export function dealClosedEmail(actor: string, outcome: 'won' | 'lost', company: string, value: string, url: string): Rendered {
  const subject = `Deal ${outcome}: ${company} (${value})`;
  const text = `${actor} marked your deal with ${company} (${value}) as ${outcome}.\n\nOpen it: ${url}`;
  return { subject, text, html: layout(`Deal ${outcome}`, p(`${actor} marked your deal with ${company} (${value}) as ${outcome}.`) + button(url, 'Open deal')) };
}

export function taskReminderEmail(title: string, when: string, company: string | null, url: string): Rendered {
  const subject = `Reminder: ${title} (due ${when})`;
  const text = `Reminder: "${title}" is due ${when}.${company ? `\nRelated to: ${company}` : ''}\n\nOpen it: ${url}`;
  return { subject, text, html: layout('Task reminder', p(`“${title}” is due ${when}.`) + (company ? p(`Related to: ${company}`) : '') + button(url, 'Open tasks')) };
}

export function taskReminderSms(title: string, when: string, company: string | null): string {
  const t = title.length > 70 ? `${title.slice(0, 67)}...` : title;
  return `Northstar reminder: "${t}" is due ${when}.${company ? ` (${company})` : ''}`;
}

export interface WeeklyData {
  name: string; workspace: string; money: (n: number) => string;
  newLeads: number; wonCount: number; wonValue: number; openCount: number; openValue: number; weighted: number;
  overdue: number; upcoming: { title: string; when: string }[]; url: string;
}
export function weeklyEmail(d: WeeklyData): Rendered {
  const subject = `Your weekly Northstar summary - ${d.workspace}`;
  const lines = [
    `New leads (7 days): ${d.newLeads}`,
    `Deals won (7 days): ${d.wonCount} worth ${d.money(d.wonValue)}`,
    `Open pipeline: ${d.money(d.openValue)} across ${d.openCount} deals (weighted ${d.money(d.weighted)})`,
    `Your overdue tasks: ${d.overdue}`,
  ];
  const text = `Hi ${d.name},\n\nHere is your week in ${d.workspace}:\n\n${lines.join('\n')}\n\n${d.upcoming.length ? `Your next tasks:\n${d.upcoming.map((t) => `- ${t.title} (${t.when})`).join('\n')}\n\n` : ''}Open Northstar: ${d.url}`;
  const rows = lines.map((l) => `<li style="margin:4px 0">${esc(l)}</li>`).join('');
  const tasks = d.upcoming.length ? `<p style="font-weight:600;margin:16px 0 4px">Your next tasks</p><ul style="padding-left:18px;margin:0">${d.upcoming.map((t) => `<li style="margin:4px 0">${esc(t.title)} <span style="color:#5b6580">(${esc(t.when)})</span></li>`).join('')}</ul>` : '';
  return { subject, text, html: layout(`Your week in ${d.workspace}`, p(`Hi ${d.name}, here is a snapshot of the last 7 days.`) + `<ul style="font-size:15px;line-height:1.5;padding-left:18px;margin:0">${rows}</ul>${tasks}` + button(d.url, 'Open Northstar')) };
}

export function leadEmailHtml(body: string, sender: string): string {
  const paras = body.split(/\n{2,}/).map((x) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(x).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0b1437">${paras}<p style="font-size:12px;color:#5b6580">Sent by ${esc(sender)} via Northstar CRM</p></body></html>`;
}

export function testEmail(): Rendered {
  return { subject: 'Northstar test email', text: 'This is a test email from Northstar CRM. If you can read this, email delivery works.', html: layout('Test email', p('This is a test email from Northstar CRM. If you can read this, email delivery works.')) };
}
