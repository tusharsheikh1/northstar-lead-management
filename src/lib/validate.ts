export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
export const parseMoney = (s: string | number): number => {
  if (typeof s === 'number') return s;
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''));
  return n;
};
