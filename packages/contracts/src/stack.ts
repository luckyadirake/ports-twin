import type { Fact, DecisionBand } from './fact';
import type { BoxId, SpaceId } from './l1';

export interface BoxPosition { readonly block: SpaceId; readonly bay: number; readonly row: number; readonly tier: number; }
export type BoxSize = '20' | '40' | '45';
export type BoxType = 'DRY' | 'HC' | 'REEFER' | 'TANK' | 'OPEN_TOP';

export interface BoxState {
  readonly id: BoxId;                 // ISO 6346, valid check digit
  readonly pos: BoxPosition;
  readonly size: BoxSize;
  readonly type: BoxType;
  readonly weightClass: 1 | 2 | 3 | 4;
  readonly dg?: string;               // IMDG class, drives segregation legality
  readonly target: 'VESSEL' | 'GATE' | 'RAIL' | 'NONE';
  readonly freeTimeExpiresAt?: number;
}

export interface BlockState {
  readonly id: SpaceId;
  readonly rows: number;
  readonly bays: number;
  readonly maxTier: number;
  readonly boxes: readonly BoxState[];
  readonly targets: readonly BoxId[];   // wanted by the current work queue
}

export interface DigResult {
  readonly productive: Fact<number>;
  /** re-handles. The number that matters, and the one a planner will attack. */
  readonly unproductive: Fact<number>;
  readonly ascSeconds: Fact<number>;
  readonly meanDigDepth: Fact<number>;
  readonly byRow: readonly { readonly row: number; readonly blockers: number; readonly targets: number }[];
}

export interface PresequenceResult {
  readonly movesNow: Fact<number>;
  readonly movesSaved: Fact<number>;
  /** MAY BE NEGATIVE. Do not clamp — a model that can only recommend action is theatre. */
  readonly net: Fact<number>;
  readonly ascIdleUsedPct: Fact<number>;
  readonly window: readonly [number, number];
  readonly band: DecisionBand;
}
