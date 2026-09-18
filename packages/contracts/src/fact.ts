/** No raw number reaches a component. Everything displayed is a Fact<T>. */

export type Unit =
  | 'TEU' | 'moves' | 'movesPerHr' | 'h' | 'min' | 's'
  | 'kWh' | 'gCO2e' | 'tCO2e' | 'SGD' | 'pct' | 'tiers'
  | 'trucks' | 'slots' | 'degC' | 'mm/s' | 'A' | 't' | 'none';

export interface SimInstant {
  /** simulated epoch milliseconds */
  readonly t: number;
  readonly branch: BranchId;
}

export type BranchId = string; // 'A' is always the live branch

export interface LineageRef {
  readonly producedBy: string;          // model id, e.g. 'stack-v3'
  readonly inputs: readonly string[];   // L1 event ids or upstream fact ids
}

export type DecisionBand = 'AUTO' | 'ASSIST' | 'ADVISE';

export interface Fact<T> {
  readonly value: T;
  readonly unit: Unit;
  /** 0..1, from the producing model. Never hand-set. */
  readonly confidence: number;
  readonly modelVersion: string;
  readonly asOf: SimInstant;
  readonly lineage: LineageRef;
  readonly band?: DecisionBand;
}

export interface BandThresholds { readonly auto: number; readonly assist: number; }

export const DEFAULT_BANDS: BandThresholds = { auto: 0.78, assist: 0.45 };

/**
 * Bands are COMPUTED, never authored. Thresholds are live-editable on stage —
 * that dial is a governance decision and it belongs to the customer.
 */
export function bandFor(
  confidence: number,
  blastRadius: number,   // 0..1, normalised affected-asset count
  reversibility: number, // 0..1, 1 = fully reversible inside the window
  th: BandThresholds = DEFAULT_BANDS,
): DecisionBand {
  const score = confidence * reversibility * (1 - blastRadius);
  if (score >= th.auto) return 'AUTO';
  if (score >= th.assist) return 'ASSIST';
  return 'ADVISE';
}

let factSeq = 0;
/** Test/mock helper. Production facts are minted by the models that own them. */
export function fact<T>(
  value: T, unit: Unit, confidence: number, modelVersion: string,
  asOf: SimInstant, inputs: readonly string[] = [], band?: DecisionBand,
): Fact<T> {
  factSeq++;
  return band === undefined
    ? { value, unit, confidence, modelVersion, asOf, lineage: { producedBy: modelVersion, inputs } }
    : { value, unit, confidence, modelVersion, asOf, lineage: { producedBy: modelVersion, inputs }, band };
}
