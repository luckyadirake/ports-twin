import type { Fact, Unit } from '@meridian/contracts';

const UNIT_LABEL: Record<Unit, string> = {
  TEU: 'TEU', moves: 'moves', movesPerHr: 'mv/hr', h: 'h', min: 'min', s: 's',
  kWh: 'kWh', gCO2e: 'gCO₂e', tCO2e: 'tCO₂e', SGD: 'S$', pct: '%',
  tiers: 'tiers', trucks: 'trucks', slots: 'slots', degC: '°C', 'mm/s': 'mm/s',
  A: 'A', t: 't', none: '',
};

export function unitLabel(u: Unit): string { return UNIT_LABEL[u]; }

export function formatValue(v: number, unit: Unit): string {
  if (unit === 'SGD') {
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'm';
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-SG');
    return v.toFixed(0);
  }
  if (unit === 'none') return Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString('en-SG');
  if (unit === 'pct') return v.toFixed(1);
  /* countable things are whole. "851.8 moves" is not a number anyone says. */
  if (unit === 'moves' || unit === 'slots' || unit === 'trucks' || unit === 'TEU') {
    return Math.round(v).toLocaleString('en-SG');
  }
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-SG');
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

export const show = (f: Fact<number>): string => formatValue(f.value, f.unit);

export function simClock(t: number): string {
  const d = new Date(t);
  const dow = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getUTCDay()];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} ${dow}`;
}

export function relHours(from: number, to: number): string {
  const h = (to - from) / 3_600_000;
  const s = h < 0 ? '−' : '+';
  const a = Math.abs(h);
  return a >= 24 ? `T${s}${(a / 24).toFixed(1)}d` : `T${s}${a.toFixed(1)}h`;
}
