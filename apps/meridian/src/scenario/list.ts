import type { ScenarioId } from '@meridian/contracts';

/**
 * The scenario order, in one place. The rail renders it and the keyboard
 * shortcuts index into it, so the number printed on a tab is always the key
 * that selects it — they cannot drift apart the way they did when each kept
 * its own copy.
 */
export interface ScenarioEntry {
  readonly id: ScenarioId;
  readonly label: string;
  readonly scale: string;
}

export const SCENARIO_LIST: readonly ScenarioEntry[] = [
  { id: 'vessel-delay', label: 'Vessel arrives late', scale: 'Terminal · hours' },
  { id: 'jit-arrival', label: 'Arrive just in time', scale: 'Port · days · upside' },
  { id: 'agv-reroute', label: 'Reroute the AGV fleet', scale: 'Fleet · minutes' },
  { id: 'monsoon-sway', label: 'Monsoon — crane sway', scale: 'Asset · milliseconds' },
];
