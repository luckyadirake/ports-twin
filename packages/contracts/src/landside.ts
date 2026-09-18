import type { Fact, DecisionBand } from './fact';
import type { PartyId, BoxId } from './l1';

export interface AppointmentWindow {
  readonly id: string;
  readonly span: readonly [number, number];  // 30-minute windows
  readonly capacity: number;
  /** FROM THE HAULIER via askPeer — counts only, never the job list. */
  readonly firm: Fact<number>;
  readonly provisional: Fact<number>;
  readonly released: Fact<number>;
  readonly arrivalsSoFar: number;
  readonly invalidated: boolean;
}

export interface GateLane { readonly id: string; readonly open: boolean; readonly serviceRatePerHr: Fact<number>; readonly serving: number; }

export interface GateState {
  readonly lanes: readonly GateLane[];
  readonly queueLength: Fact<number>;
  /** gate-in to gate-out. The landside twin of vessel turnaround. */
  readonly truckTurnTimeMin: Fact<number>;
  readonly ttSplit: { readonly queueWait: number; readonly service: number; readonly yardInterchange: number };
  readonly windows: readonly AppointmentWindow[];
}

export interface SlotOffer {
  readonly id: string;
  readonly toParty: PartyId;
  readonly windows: readonly { readonly windowId: string; readonly slots: number; readonly priority: number }[];
  readonly reason: string;             // shown to the haulier, in their words
  readonly expiresAt: number;
  /** ASSIST by construction — the blast radius leaves the organisation. */
  readonly band: DecisionBand;
}

export type LandsideIntervention =
  | { readonly type: 'reofferSlots'; readonly offer: SlotOffer }
  | { readonly type: 'acceptOffer'; readonly offerId: string; readonly byParty: PartyId; readonly windowIds: readonly string[] }
  | { readonly type: 'openLane'; readonly laneId: string }
  | { readonly type: 'shiftWindow'; readonly windowId: string; readonly byMinutes: number }
  | { readonly type: 'callDepot'; readonly boxType: string; readonly count: number }
  | { readonly type: 'holdForRail'; readonly slotId: string; readonly boxes: readonly BoxId[] };
