/**
 * Normalises a Bangladeshi mobile number to the international form without "+": 8801XXXXXXXXX.
 * Accepts 01712345678, 8801712345678, +8801712345678, 1712345678 (spaces, dashes, brackets ignored).
 * Operator prefixes 013-019 are valid. Returns null for anything else (landlines, foreign numbers).
 */
export function normalizeBdMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[\s\-().]/g, '');
  const m = digits.match(/^(?:\+?880|0)?(1[3-9]\d{8})$/);
  return m ? `880${m[1]}` : null;
}

export const BD_PHONE_HINT = 'Enter a Bangladeshi mobile number such as 01712345678 or +8801712345678.';
