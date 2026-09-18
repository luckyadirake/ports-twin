/** Thermal ramp. Telemetry only — never decoration. */
const STOPS: readonly [number, number, number][] = [
  [0x15, 0x38, 0xc8], [0x12, 0xa9, 0xe0], [0x2b, 0xd9, 0x8a],
  [0xf2, 0xd5, 0x44], [0xff, 0x8c, 0x1a], [0xff, 0x3b, 0x30],
];

export function heat(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = STOPS[i]!, b = STOPS[i + 1]!;
  const c = (k: 0 | 1 | 2) => Math.round(a[k] + (b[k] - a[k]) * f);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

/** Normalise a reading against its envelope into 0..1 for the ramp. */
export const vsEnvelope = (v: number, env: number, floor = 0.55) =>
  Math.min(1, Math.max(0, (v / env - floor) / (1.25 - floor)));
