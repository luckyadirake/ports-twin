import type { BranchId, BandThresholds } from './fact';
import type { AssetId, SpaceId, Role } from './l1';
import type { LandsideIntervention } from './landside';
import type { PeerQuery } from './peer';
import type { ScenarioId } from './scenario';
import type { PlateId } from './plate';
import type { LensId } from './lens';

export interface Policy {
  readonly id: string;
  readonly label: string;
  readonly presequence: boolean;
  readonly forwardModel: boolean;
  readonly informationDelayH: number;
  readonly maxConcurrentReplans: number;
}

export type TerminalIntervention =
  | { readonly type: 'reassignBerth'; readonly vesselId: string; readonly berthId: SpaceId }
  | { readonly type: 'setCraneSplit'; readonly vesselId: string; readonly cranes: number }
  | { readonly type: 'derateCrane'; readonly craneId: AssetId; readonly factor: number }
  | { readonly type: 'reassignLoad'; readonly fromCrane: AssetId; readonly toCrane: AssetId }
  | { readonly type: 'presequenceYard'; readonly blockId: SpaceId; readonly window: readonly [number, number] }
  | { readonly type: 'movePool'; readonly from: SpaceId; readonly to: SpaceId; readonly count: number }
  | { readonly type: 'approvePlan'; readonly planId: string; readonly byRole: Role };

export type Intervention = TerminalIntervention | LandsideIntervention;

/** What "Ask the port" compiles to. The model NEVER returns a number. */
export interface ScenarioSpec {
  readonly label: string;
  readonly forkAt: 'now' | number;
  readonly interventions: readonly Intervention[];
  readonly horizonH: number;
  readonly compare: BranchId;
  readonly unparsed?: string;
}

export type KernelCommand =
  | { readonly kind: 'play' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'setRate'; readonly rate: number }
  | { readonly kind: 'scrubTo'; readonly t: number }
  | { readonly kind: 'fork'; readonly at: number; readonly policy: Policy; readonly label: string }
  | { readonly kind: 'closeFork'; readonly branch: BranchId }
  | { readonly kind: 'adopt'; readonly branch: BranchId }
  | { readonly kind: 'intervene'; readonly action: Intervention }
  | { readonly kind: 'setBands'; readonly thresholds: BandThresholds }
  | { readonly kind: 'askPeer'; readonly query: PeerQuery }
  | { readonly kind: 'checkpoint'; readonly name: string }
  | { readonly kind: 'restore'; readonly name: string }
  | { readonly kind: 'selectScenario'; readonly id: ScenarioId }
  | { readonly kind: 'setDisturbance'; readonly value: number }
  | { readonly kind: 'chooseAdaptation'; readonly id: string | null }
  | { readonly kind: 'setPlate'; readonly plate: PlateId | 'auto' }
  | { readonly kind: 'setLens'; readonly lens: LensId }
  | { readonly kind: 'chooseAdaptationB'; readonly id: string | null }
  | { readonly kind: 'previewAdaptation'; readonly id: string | null };
