import type { Fact, SimInstant } from './fact';
import type { PartyId, CommunityParty } from './l1';

export type PeerSubject =
  | 'firmSlotCount'            // the demo's federation set-piece
  | 'stowageDeltaSummary'
  | 'releaseState'
  | 'emptyAvailability'
  | 'railSlotAvailability'
  | 'requiredDeliveryWindow';

export interface PeerQuery {
  readonly askingParty: PartyId;
  readonly askedParty: PartyId;
  readonly party: CommunityParty;
  readonly subject: PeerSubject;
  readonly scope: { readonly ref: string; readonly horizonH: number };  // hashed ref, never a name
  readonly purpose: string;            // logged, shown in the ledger
}

export interface PeerAnswer {
  readonly query: PeerQuery;
  readonly answer: Fact<number>;
  /** Exactly what crossed, field by field. */
  readonly disclosed: readonly { readonly field: string; readonly value: string; readonly reason: string }[];
  /** Named so the drawer can show it. This list is the whole point. */
  readonly withheld: readonly { readonly field: string; readonly reason: string }[];
  readonly latencyMs: number;
}

export interface SovereigntyEntry extends PeerAnswer { readonly at: SimInstant; readonly id: string; }

/**
 * HARD BOUNDARY. Community party state lives in its own module with no import
 * path to the terminal store, and the only crossing is askPeer(). A build that
 * violates this fails lint. The architecture IS the claim.
 */
