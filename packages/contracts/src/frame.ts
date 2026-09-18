import type { Fact, SimInstant, BranchId } from './fact';
import type { AssetId, SpaceId, EventRecord } from './l1';
import type { BlockState, DigResult, PresequenceResult } from './stack';
import type { GateState } from './landside';
import type { SovereigntyEntry } from './peer';
import type { ScenarioState } from './scenario';

export interface KpiSet {
  readonly vesselTurnaroundH: Fact<number>;
  readonly movesPerHour: Fact<number>;
  readonly yardDigMoves: Fact<number>;
  readonly yardRehandleRate: Fact<number>;
  readonly truckTurnTimeMin: Fact<number>;
  readonly gateSlotsForfeited: Fact<number>;
  readonly connectionsAtRisk: Fact<number>;
  readonly teuAtRisk: Fact<number>;
  readonly energyKwhPerMove: Fact<number>;
  readonly co2gPerMove: Fact<number>;
  readonly demurrageExposure: Fact<number>;
  readonly assetAvailabilityPct: Fact<number>;
  /** hours this call spends at anchorage waiting for a berth */
  readonly anchorageWaitH: Fact<number>;
  /** tonnes of bunker fuel NOT burned on the last leg, against today's behaviour */
  readonly fuelTonnesSaved: Fact<number>;
}

export interface BerthState {
  readonly id: SpaceId;
  readonly vesselId?: AssetId;
  readonly vesselName?: string;
  readonly window: readonly [number, number];
  readonly craneIds: readonly AssetId[];
  readonly movesRemaining: number;
}

export interface CraneState {
  readonly id: AssetId;
  readonly x: number;              // metres along quay
  readonly trolley: number;        // 0..1 seaward
  readonly hoist: number;          // 0..1, 1 = stowed high
  readonly deratePct: number;      // 0 = nominal
  readonly movesPerHr: number;
}

export interface VehicleState {
  readonly id: AssetId;
  readonly kind: 'AGV' | 'ASC' | 'TRUCK';
  readonly x: number; readonly z: number; readonly heading: number;
  readonly laden: boolean;
  readonly soc: number;            // 0..1 battery state of charge
  readonly kwhPerMove: number;
}

export interface AssetHealth {
  readonly id: AssetId;
  readonly windingTempC: number;
  readonly vibrationRms: number;   // mm/s
  readonly hoistCurrentA: number;
  readonly envelope: { readonly tempC: number; readonly vibRms: number; readonly currentA: number };
  readonly rulHours: Fact<number>;
  readonly damage: number;         // 0..1 cumulative
}

export interface ConnectionRisk {
  readonly id: string;
  readonly label: string;
  readonly risk: Fact<number>;     // 0..1 probability the window fails
  readonly teu: number;
}

export interface VesselCall {
  readonly id: string;
  readonly name: string;
  readonly carrier: string;
  readonly teu: number;
  readonly eta: Fact<number>;
  readonly etaDeltaH: number;
  readonly berth?: SpaceId;
}

export interface ConfidenceCone {
  readonly subject: 'berthWindow' | 'eta' | 'rul' | 'truckTurnTime';
  readonly subjectId: string;
  readonly points: readonly { readonly t: number; readonly p10: number; readonly p50: number; readonly p90: number }[];
  readonly n: number;
  readonly modelVersion: string;
}

export interface RegretDelta {
  readonly against: BranchId;
  readonly branch: BranchId;
  readonly sgdPerMinute: Fact<number>;
  readonly cumulativeSgd: Fact<number>;
  readonly co2DeltaT: Fact<number>;
  readonly teuAtRiskDelta: Fact<number>;
  readonly truckHoursLost: Fact<number>;
  readonly connectionsLostDelta: Fact<number>;
}

export interface KernelFrame {
  readonly instant: SimInstant;
  readonly branch: BranchId;
  readonly seq: number;

  readonly portHorizon: {
    readonly calls: readonly VesselCall[];
    readonly conns: readonly ConnectionRisk[];
    readonly community: readonly SovereigntyEntry[];
    readonly cone: ConfidenceCone | null;
  };

  readonly terminal: {
    readonly berths: readonly BerthState[];
    readonly cranes: readonly CraneState[];
    readonly fleet: readonly VehicleState[];
    readonly stacks: readonly BlockState[];
    readonly gate: GateState;
    readonly dig: Readonly<Record<SpaceId, DigResult>>;
    readonly presequence: PresequenceResult | null;
  };

  readonly assets: readonly AssetHealth[];
  readonly events: readonly EventRecord[];
  readonly kpis: KpiSet;
  readonly regret: RegretDelta | null;
  /** The posed scenario and everything it implies. The console reads this. */
  readonly scenario: ScenarioState;
}
