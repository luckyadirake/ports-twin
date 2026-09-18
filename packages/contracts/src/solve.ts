import type { LensId } from './lens';

/**
 * THE AGENT LAYER.
 *
 * The weak version of "AI agents" is a spinner over a hardcoded list. This is
 * the other one: each agent owns a model the kernel already runs, searches its
 * own action space against that model, and is scored by the SAME maths the
 * console uses to explain the problem. A recommendation therefore cannot
 * disagree with the diagnosis — which is the only property that makes this
 * worth showing to an operator.
 */
export type AgentId = 'berth' | 'yard' | 'landside' | 'fleet' | 'voyage';

/** The six beats of a solve, in order. The console animates through them. */
export type SolvePhase =
  | 'idle' | 'brief' | 'solve' | 'arbitrate' | 'simulate' | 'render' | 'report';

export const SOLVE_PHASES: readonly SolvePhase[] =
  ['brief', 'solve', 'arbitrate', 'simulate', 'render', 'report'];

export interface AgentRun {
  readonly id: AgentId;
  readonly label: string;
  /** what this agent owns, in one line */
  readonly mandate: string;
  /** does it have a stake in THIS disturbance */
  readonly engaged: boolean;
  /** candidates it actually scored */
  readonly evaluated: number;
  /** candidates that beat doing nothing */
  readonly proposed: number;
  /** the adaptation id it put forward, if any */
  readonly best: string | null;
  /** score of that best candidate, in the active lens's currency */
  readonly score: number;
}

/**
 * A plan another agent's plan made impossible. Showing one of these resolved is
 * worth more than three tidy options — a curated list can never produce one.
 */
export interface Rejection {
  readonly agent: AgentId;
  readonly label: string;
  readonly reason: string;
}

export interface SolveResult {
  readonly agents: readonly AgentRun[];
  readonly rejected: readonly Rejection[];
  readonly evaluated: number;
  /** the lens the candidates were priced in — the ranking depends on it */
  readonly lens: LensId;
}
