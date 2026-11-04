/** Mirrors the server: normalises a Bangladeshi mobile number to 8801XXXXXXXXX, or null if it is not one. */
export function normalizeBdMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.replace(/[\s\-().]/g, '').match(/^(?:\+?880|0)?(1[3-9]\d{8})$/);
  return m ? `880${m[1]}` : null;
}
export const BD_PHONE_HINT = 'Use a Bangladeshi mobile number such as 01712345678 or +8801712345678.';
/** Display form: +880 1712-345678 */
export const formatBd = (n: string) => `+${n.slice(0, 3)} ${n.slice(3, 7)}-${n.slice(7)}`;
