import { format, formatDistanceToNowStrict, isValid } from 'date-fns';
import type { Settings } from '../types';

export interface Formatter {
  money: (n: number) => string;
  moneyCompact: (n: number) => string;
  number: (n: number) => string;
  percent: (n: number, digits?: number) => string;
  date: (iso: string | Date) => string;
  time: (iso: string | Date) => string;
  dateTime: (iso: string | Date) => string;
  relative: (iso: string) => string;
}

export function makeFormatter(ws: Settings['workspace']): Formatter {
  const locale = ws.language || 'en-US';
  const currency = ws.currency || 'USD';
  const tz = ws.timeZone && ws.timeZone !== 'auto' ? ws.timeZone : undefined;
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
  const plain = new Intl.NumberFormat(locale);
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz });
  const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
  const safe = (v: string | Date, fn: (d: Date) => string) => {
    const d = toDate(v);
    return isValid(d) ? fn(d) : '—';
  };
  return {
    money: (n) => money.format(n),
    moneyCompact: (n) => (Math.abs(n) < 1000 ? money.format(n) : compact.format(n).replace('K', 'k')),
    number: (n) => plain.format(n),
    percent: (n, digits = 1) => `${n.toFixed(digits)}%`,
    date: (v) => safe(v, (d) => format(d, ws.dateFormat || 'MMM d, yyyy')),
    time: (v) => safe(v, (d) => timeFmt.format(d)),
    dateTime: (v) => safe(v, (d) => `${format(d, ws.dateFormat || 'MMM d, yyyy')}, ${timeFmt.format(d)}`),
    relative: (iso) => {
      const d = new Date(iso);
      if (!isValid(d)) return '—';
      const ms = Date.now() - d.getTime();
      if (Math.abs(ms) < 60_000) return 'just now';
      if (ms < 0) return `in ${formatDistanceToNowStrict(d)}`;
      const s = formatDistanceToNowStrict(d, { roundingMethod: 'floor' });
      return `${s.replace(/ seconds?/, 's').replace(/ minutes?/, ' min').replace(/ hours?/, 'h').replace(/ days?/, 'd').replace(/ months?/, ' mo').replace(/ years?/, 'y')} ago`;
    },
  };
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export const firstName = (name: string) => name.split(' ')[0] ?? name;

export const DATE_FORMATS = [
  { value: 'MMM d, yyyy', label: 'Nov 4, 2026' },
  { value: 'dd/MM/yyyy', label: '04/11/2026' },
  { value: 'MM/dd/yyyy', label: '11/04/2026' },
  { value: 'yyyy-MM-dd', label: '2026-11-04' },
];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'BDT', 'JPY'];
export const TIME_ZONES = ['auto', 'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Dhaka', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];
