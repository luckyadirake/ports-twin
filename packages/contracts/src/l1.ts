/** L1 — the context layer everyone skips. Six entities, one identity each. */

export type AssetId = string;
export type SpaceId = string;
export type BoxId   = string;
export type PartyId = string;

export type AssetKind = 'AQC' | 'ASC' | 'AGV' | 'TRUCK' | 'VESSEL' | 'GATE_LANE' | 'RAIL_WAGON';

export interface Asset {
  readonly id: AssetId;
  readonly kind: AssetKind;
  readonly parent?: AssetId;            // gives blast radius for free
  readonly owner: PartyId;
  /** metres, terminal frame: +X along the quay, +Z inland, +Y up */
  readonly pos: readonly [number, number, number];
  readonly heading: number;             // radians
}

export type SpaceKind = 'BERTH' | 'BLOCK' | 'LANE' | 'GATE' | 'ZONE' | 'DEPOT' | 'RAIL';

export interface Space {
  readonly id: SpaceId;
  readonly kind: SpaceKind;
  readonly origin: readonly [number, number];  // x,z metres
  readonly size: readonly [number, number];    // w,d metres
  readonly capacity: number;
  readonly adjacent: readonly SpaceId[];
}

export type EventType =
  | 'BOX_GROUNDED' | 'BOX_LIFTED' | 'VESSEL_ARRIVED' | 'VESSEL_DEPARTED'
  | 'ASSET_DERATED' | 'PLAN_REVISED' | 'CONNECTION_AT_RISK'
  | 'WINDOW_INVALIDATED' | 'SLOT_OFFERED' | 'SLOT_ACCEPTED'
  | 'PEER_QUERY' | 'PEER_ANSWER' | 'ZONE_BREACH';

export interface EventRecord {
  readonly id: string;
  readonly type: EventType;
  readonly subject: AssetId | SpaceId | BoxId;
  readonly at: number;                  // sim epoch ms
  readonly source: string;
  readonly confidence: number;
  readonly payload?: Readonly<Record<string, string | number | boolean>>;
}

export type Role =
  | 'DUTY_MANAGER' | 'CRANE_ENGINEER' | 'NETWORK_PLANNER' | 'SAFETY_OFFICER'
  | 'OT_SECURITY' | 'ENERGY_MANAGER' | 'PROJECT_MANAGER' | 'GROUP_EXEC'
  | 'SHIPPER' | 'HAULIER_DISPATCH';

export interface Party {
  readonly id: PartyId;
  readonly label: string;
  readonly kind: 'TERMINAL' | CommunityParty;
  /** what this party will disclose, and the stated reason for each refusal */
  readonly discloses: readonly string[];
  readonly withholds: readonly { readonly field: string; readonly reason: string }[];
}

export type CommunityParty = 'carrier' | 'haulier' | 'depot' | 'customs' | 'forwarder' | 'rail';
