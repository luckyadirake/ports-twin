/** Deterministic PRNG. No Math.random anywhere in kernel or seed — ever. */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
export const range = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);
export const intRange = (r: Rng, lo: number, hi: number) => Math.floor(range(r, lo, hi + 1));

/** Box–Muller, deterministic. */
export function gauss(r: Rng, mean = 0, sd = 1): number {
  const u = Math.max(r(), 1e-9), v = Math.max(r(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** ISO 6346 check digit. An engineer in the room may well check one. */
export function iso6346(owner: string, serial: number): string {
  const body = owner + String(serial).padStart(6, '0');
  const val = (c: string): number => {
    if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
    let n = c.charCodeAt(0) - 55;            // A=10
    if (n >= 11) n += Math.floor((n - 11) / 10) + 1;  // skip multiples of 11
    return n;
  };
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += val(body[i] as string) * (1 << i);
  return body + String(sum % 11 % 10);
}
