import type { Fact, DecisionBand, Unit } from './fact';
import type { KpiSet } from './frame';
import type { PlateId } from './plate';
import type { LensId, OverlayId } from './lens';
import type { SolveResult, AgentId } from './solve';

export type ScenarioId = 'monsoon-sway' | 'vessel-delay' | 'agv-reroute' | 'jit-arrival';
export type Scale = 'ASSET' | 'FLEET' | 'TERMINAL' | 'PORT';

/** The single control the operator moves to pose the disturbance. */
export interface Disturbance {
  readonly label: string;
  readonly unit: Unit;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  /** shown under the slider, in the operator's words */
  readonly caption: string;
}

/**
 * One link in the cause-and-effect chain. Nobody writes the chain: each model
 * reads state the previous one wrote, so it survives being asked a question the
 * demo did not anticipate.
 */
export interface PropagationStep {
  readonly scale: Scale;
  readonly clock: string;
  readonly title: string;
  /** two or three words for the cascade node */
  readonly short: string;
  readonly detail: string;
  /** when this consequence lands, ms after the disturbance. Places it on the axis. */
  readonly atMs: number;
  /** the causal verb on the arrow INTO this step */
  readonly because: string;
  readonly fact: Fact<number>;
  /** what moved, for the node's delta line */
  readonly from?: string;
  readonly to?: string;
  readonly severity: 'ok' | 'watch' | 'alarm';
  /** where on the plate this step is happening, normalised, for the hotspot */
  readonly anchor?: readonly [number, number];
  /** the shot that SHOWS this link. One per link, not one per scenario. */
  readonly clip: string;
  /**
   * Which KPI this link owns. The chain describes the DISTURBANCE, so its own
   * fact does not move when a plan is applied — the projection needs to know
   * which measured number a plan would move at this link instead.
   */
  readonly kpi?: keyof KpiSet;
}

/** How loudly this disturbance reaches each of the eight audiences. */
export interface AudienceSignal {
  readonly lens: LensId;
  readonly label: string;
  /** 0 quiet · 1 touched · 2 involved · 3 in the room */
  readonly severity: 0 | 1 | 2 | 3;
  readonly headline: string;
}

/** The current lens's view of this scenario. One model, this audience's question. */
export interface LensFacet {
  readonly lens: LensId;
  readonly headline: string;
  readonly kpis: readonly (keyof KpiSet)[];
  readonly overlays: readonly OverlayId[];
  /** adaptation ids this audience has the authority to touch */
  readonly allowed: readonly string[];
  /** the cascade, retold. Keyed by step index; absent means use the default. */
  readonly retell: Readonly<Record<number, {
    readonly title: string; readonly detail: string; readonly clip?: string;
  }>>;
}

/** Where a consequence switches on, marked on the disturbance control. */
export interface Threshold {
  readonly value: number;
  readonly label: string;
  readonly severity: 'watch' | 'alarm' | 'gain';
}

/**
 * Where the value of turning the control up stops being worth it. Computed by
 * scanning the SAME model the outcome comes from, and recomputed per lens —
 * because the optimum depends entirely on whose currency you price it in.
 */
export interface Optimum {
  readonly value: number;
  readonly label: string;
  /** what the other lenses would choose instead, for the disagreement line */
  readonly others: readonly { readonly lens: LensId; readonly value: number }[];
}

export interface Adaptation {
  readonly id: string;
  readonly label: string;
  readonly rationale: string;
  readonly costs: readonly Fact<number>[];
  readonly saves: readonly Fact<number>[];
  readonly band: DecisionBand;
  readonly recommended: boolean;
}

/** Baseline is what happens if nobody acts. This is the only honest comparison. */
export interface Comparison {
  readonly baseline: KpiSet;
  readonly adapted: KpiSet;
  /** the head-to-head second option, when one is picked */
  readonly adaptedB: KpiSet | null;
  readonly chosen: string | null;
  readonly chosenB: string | null;
  readonly deltaSgd: Fact<number>;
  readonly deltaTeu: Fact<number>;
  readonly deltaHours: Fact<number>;
}

/** Drives the in-engine weather layer, so severity is modelled rather than baked. */
export interface WeatherState {
  readonly windKt: number;
  readonly rain: number;        // 0..1
  readonly visibility: number;  // 0..1, 1 = clear
  readonly gustPhase: number;   // 0..1, animates the sway
}

/**
 * A plan the agents are SIMULATING but nobody has committed. The console draws
 * it over the port as a projection — visibly not-yet-real — so the operator can
 * see what a plan would do to each link before deciding to own it.
 */
export interface PlanPreview {
  readonly id: string;
  readonly label: string;
  readonly agent: AgentId | null;
  readonly kpis: KpiSet;
  /** the chain as it would read under this plan — for the per-link deltas */
  readonly chain: readonly PropagationStep[];
  readonly fixed: readonly number[];
  readonly cranes: number;
  readonly dig: number;
}

export interface ScenarioState {
  readonly id: ScenarioId;
  readonly label: string;
  readonly subtitle: string;
  readonly plate: PlateId;
  readonly scale: Scale;
  readonly disturbance: Disturbance;
  readonly chain: readonly PropagationStep[];
  readonly adaptations: readonly Adaptation[];
  readonly comparison: Comparison;
  readonly weather: WeatherState;
  readonly audiences: readonly AudienceSignal[];
  readonly facet: LensFacet;
  readonly thresholds: readonly Threshold[];
  /**
   * 'disturbance' — something happened, the console shows how far it travels.
   * 'improvement' — nothing is wrong; the control is a planning decision and
   * everything downstream gets BETTER as it is turned up. The console inverts
   * its sign language rather than pretending a gain is a threat.
   */
  readonly polarity: 'disturbance' | 'improvement';
  /** only meaningful on an improvement scenario */
  readonly optimum: Optimum | null;
  /** what the agents searched, and what they rejected, to produce `adaptations` */
  readonly solve: SolveResult;
  /** chain links the committed plan actually repairs — drives the stage */
  readonly fixed: readonly number[];
  /** crane count the committed plan works the call with, for the stage */
  readonly cranes: number;
  /** unproductive moves under the committed plan, for the stage */
  readonly dig: number;
  /** the plan being simulated over the port, before anyone commits to it */
  readonly preview: PlanPreview | null;
  /** the insert clip that belongs to this scenario's key beat */
  readonly insert: string;
}
