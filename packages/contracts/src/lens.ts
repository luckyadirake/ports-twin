import type { DecisionBand } from './fact';
import type { KpiSet } from './frame';

export type LensId =
  | 'operations' | 'engineering' | 'safety' | 'otsec'
  | 'energy' | 'commercial' | 'projects' | 'group';

export type OverlayId =
  | 'berthWindows' | 'agvFlow' | 'digHeat' | 'exceptionPins'
  | 'healthHalos' | 'loadSpectra' | 'dutyCycle'
  | 'exclusionZones' | 'proximity' | 'dgSegregation' | 'plume'
  | 'otSegments' | 'dependencyEdges' | 'blastRadius'
  | 'carbonRibbon' | 'microgrid' | 'shorePower'
  | 'connectionThreads' | 'freeTimeRings' | 'pharmaThread'
  | 'asBuiltWireframe' | 'deviationMarks' | 'commissioningState'
  | 'rollupFrame';

export type PanelId =
  | 'berth' | 'block' | 'asset' | 'gate' | 'connections'
  | 'energy' | 'zones' | 'dependencies' | 'projects' | 'rollup';

export interface LensConfig {
  readonly id: LensId;
  readonly label: string;
  readonly audience: string;
  /** Drawn over the UNCHANGED stage geometry. */
  readonly overlays: readonly OverlayId[];
  readonly kpis: readonly (keyof KpiSet)[];
  /** Same facts, this audience's words. */
  readonly vocabulary: Readonly<Record<string, string>>;
  readonly inspector: readonly PanelId[];
  readonly maxBand: DecisionBand;
  readonly accent: string;
}

/**
 * ACCEPTANCE: each config under 60 lines, and NO lens may introduce a data
 * fetch, selector or model call of its own. If a lens needs one, the L1 model
 * is wrong — escalate, do not solve it locally.
 */
