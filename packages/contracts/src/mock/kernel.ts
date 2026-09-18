/**
 * MOCK KERNEL — A0's most important deliverable.
 *
 * Deterministic, typed, and shaped exactly like the real kernel's interface.
 * Every surface agent builds against this until G1. If a surface works here it
 * works against the real kernel unchanged; if it needs something this cannot
 * express, the CONTRACT is wrong — report it, do not work around it.
 *
 * This is NOT the simulation. It produces plausible, smoothly varying values
 * with the right shape, relationships and causality so the UI can be built.
 */
import type {
  KernelFrame, KernelCommand, KpiSet, BranchId, SimInstant,
  Fact, BandThresholds, PeerAnswer, SovereigntyEntry, RegretDelta,
  AssetHealth, VehicleState, CraneState, BerthState, GateState,
  AppointmentWindow, DigResult, PresequenceResult, BlockState,
  VesselCall, ConnectionRisk, ConfidenceCone, EventRecord,
} from '../index';
import { fact, bandFor, DEFAULT_BANDS } from '../fact';
import { buildWorld, type World } from './world';
import { mulberry32, gauss, type Rng } from './rng';
import { buildScenario, DEFAULT_DISTURBANCE } from './scenarios';
import type { ScenarioId, PlateId, LensId, ScenarioState, PlanPreview } from '../index';

const T0 = Date.UTC(2026, 10, 3, 9, 14, 0);       // 09:14 on a Tuesday
const HOUR = 3_600_000;

export interface MockOptions { seed?: number; }

interface Branch {
  id: BranchId;
  label: string;
  presequence: boolean;
  seq: number;
}

export class MockKernel {
  readonly world: World;
  private readonly seed: number;
  private t = T0;
  private rate = 1;
  private playing = true;
  private bands: BandThresholds = DEFAULT_BANDS;
  private branches: Branch[] = [{ id: 'A', label: 'live', presequence: false, seq: 0 }];
  private ledger: SovereigntyEntry[] = [];
  private events: EventRecord[] = [];
  private derate: Record<string, number> = {};
  private checkpoints = new Map<string, number>();
  private forkedAt: number | null = null;
  private scenarioId: ScenarioId = 'vessel-delay';
  private disturbance: number = DEFAULT_DISTURBANCE['vessel-delay'];
  private chosen: string | null = null;
  private plateOverride: PlateId | 'auto' = 'auto';
  private lens: LensId = 'operations';
  private chosenB: string | null = null;
  private previewed: string | null = null;
  /** the previewed branch is a second full scenario build — memoise it */
  private previewCache: { key: string; scen: ScenarioState } | null = null;

  constructor(opts: MockOptions = {}) {
    this.seed = opts.seed ?? 20260913;
    this.world = buildWorld(this.seed);
  }

  get branchIds(): BranchId[] { return this.branches.map(b => b.id); }
  get now(): number { return this.t; }
  get horizon(): [number, number] { return [T0 - 7 * 24 * HOUR, T0 + 72 * HOUR]; }

  /** Advance wall time by dtMs of real time. */
  step(dtMs: number): void {
    if (!this.playing) return;
    this.t += dtMs * this.rate * 60; // 1 real second = 1 sim minute at rate 1
  }

  send(cmd: KernelCommand): void {
    switch (cmd.kind) {
      case 'play': this.playing = true; break;
      case 'pause': this.playing = false; break;
      case 'setRate': this.rate = cmd.rate; break;
      case 'scrubTo': this.t = cmd.t; break;
      case 'fork': {
        if (this.branches.length >= 2) break;
        this.forkedAt = this.t;
        this.branches.push({ id: 'B', label: cmd.label, presequence: cmd.policy.presequence, seq: 0 });
        this.pushEvent('PLAN_REVISED', 'branch:B', 'fork');
        break;
      }
      case 'closeFork':
        this.branches = this.branches.filter(b => b.id !== cmd.branch);
        if (this.branches.length === 1) this.forkedAt = null;
        break;
      case 'adopt': {
        const b = this.branches.find(x => x.id === cmd.branch);
        if (b) { this.branches = [{ ...b, id: 'A', label: 'live' }]; this.forkedAt = null; }
        break;
      }
      case 'setBands': this.bands = cmd.thresholds; break;
      case 'intervene':
        if (cmd.action.type === 'derateCrane') this.derate[cmd.action.craneId] = cmd.action.factor;
        this.pushEvent('PLAN_REVISED', cmd.action.type, 'intervention');
        break;
      case 'askPeer': {
        const a = this.answerPeer(cmd.query.party);
        this.ledger = [{ ...a, at: this.instant('A'), id: `LDG-${this.ledger.length + 1}` }, ...this.ledger].slice(0, 12);
        this.pushEvent('PEER_ANSWER', cmd.query.party, 'peer');
        break;
      }
      case 'selectScenario':
        this.scenarioId = cmd.id;
        this.disturbance = DEFAULT_DISTURBANCE[cmd.id];
        this.chosen = null;
        this.chosenB = null;
        break;
      case 'setDisturbance': this.disturbance = cmd.value; break;
      case 'chooseAdaptation': this.chosen = cmd.id; if (cmd.id === null) this.chosenB = null; break;
      case 'chooseAdaptationB': this.chosenB = cmd.id; break;
      case 'previewAdaptation': this.previewed = cmd.id; break;
      case 'setLens': this.lens = cmd.lens; break;
      case 'setPlate': this.plateOverride = cmd.plate; break;
      case 'checkpoint': this.checkpoints.set(cmd.name, this.t); break;
      case 'restore': { const t = this.checkpoints.get(cmd.name); if (t !== undefined) this.t = t; break; }
    }
  }

  /** One frame per open branch. Branch 'A' is always first. */
  frames(): KernelFrame[] { return this.branches.map(b => this.frame(b)); }

  // ---------------------------------------------------------------- internals

  private instant(branch: BranchId): SimInstant { return { t: this.t, branch }; }

  private pushEvent(type: EventRecord['type'], subject: string, source: string): void {
    this.events = [{
      id: `EV-${this.events.length + 1}`, type, subject, at: this.t, source, confidence: 0.9,
    }, ...this.events].slice(0, 40);
  }

  /** Smooth deterministic wobble keyed to sim time — same t gives same value. */
  private wob(key: number, periodMin: number, amp: number): number {
    const p = periodMin * 60_000;
    return Math.sin((this.t / p) * Math.PI * 2 + key) * amp;
  }

  private rngAt(salt: number): Rng { return mulberry32((this.seed ^ Math.floor(this.t / 60_000)) + salt); }

  private frame(b: Branch): KernelFrame {
    b.seq++;
    const inst = this.instant(b.id);
    const pre = b.presequence;

    const scen0 = buildScenario(
      this.scenarioId, this.disturbance, this.lens,
      b.id === 'B' ? null : this.chosen, b.id === 'B' ? null : this.chosenB,
      inst, (this.t % 6000) / 6000,
    );
    /* The projection is the same models run against a plan nobody has
       committed to — which is the only honest way to show "what would happen
       if". Built on demand and cached, because it is a second full solve. */
    let preview: PlanPreview | null = null;
    if (b.id !== 'B' && this.previewed !== null && this.previewed !== this.chosen) {
      const key = `${this.scenarioId}:${this.disturbance}:${this.lens}:${this.previewed}`;
      if (this.previewCache?.key !== key) {
        this.previewCache = {
          key,
          scen: buildScenario(
            this.scenarioId, this.disturbance, this.lens,
            this.previewed, null, inst, 0,
          ),
        };
      }
      const pv = this.previewCache.scen;
      const plan = pv.adaptations.find(a => a.id === this.previewed);
      preview = {
        id: this.previewed,
        label: plan?.label ?? this.previewed,
        /* the agent that OWNS this action — not the one whose best it was,
           because arbitration may have pushed it down to its second choice */
        agent: pv.solve.agents.find(a => a.best === this.previewed)?.id
          ?? (this.previewed.startsWith('surge-') || this.previewed.startsWith('reberth-') ? 'berth'
            : this.previewed.startsWith('premarshal-') ? 'yard'
              : this.previewed.startsWith('reoffer-') ? 'landside'
                : this.previewed.includes('window') ? 'voyage'
                  : this.previewed.includes('pool') || this.previewed.includes('charge') || this.previewed.includes('lane') ? 'fleet'
                    : null),
        kpis: pv.comparison.adapted,
        chain: pv.chain,
        fixed: pv.fixed,
        cranes: pv.cranes,
        dig: pv.dig,
      };
    }

    const scenario = this.plateOverride === 'auto'
      ? { ...scen0, preview } : { ...scen0, plate: this.plateOverride, preview };
    const cranes = this.cranes(inst);
    const dig = this.dig(inst, pre);
    const gate = this.gate(inst, pre);
    void this.kpis(inst, dig, gate, pre);

    return {
      instant: inst, branch: b.id, seq: b.seq,
      portHorizon: {
        calls: this.calls(inst),
        conns: this.conns(inst, pre),
        community: this.ledger,
        cone: this.cone(inst),
      },
      terminal: {
        berths: this.berths(inst),
        cranes,
        fleet: this.fleet(),
        stacks: this.stacks(pre),
        gate,
        dig: { '3C': dig },
        presequence: this.presequence(inst),
      },
      assets: this.health(inst),
      events: this.events,
      kpis: scenario.comparison.chosen ? scenario.comparison.adapted : scenario.comparison.baseline,
      regret: b.id === 'B' ? null : this.regret(inst),
      scenario,
    };
  }

  private calls(at: SimInstant): VesselCall[] {
    const v = this.world.vessel;
    return [{
      id: v.id, name: v.name, carrier: v.carrier, teu: 24000,
      eta: fact(this.t + 6 * HOUR, 'h', 0.78, 'flow-v4.2', at, ['EV-AIS-1', 'EV-CARRIER-1']),
      etaDeltaH: 14, berth: 'T2',
    }];
  }

  private conns(at: SimInstant, pre: boolean): ConnectionRisk[] {
    const base = pre ? 0.22 : 0.46;
    return [
      { id: 'SIN-ANR-4412', label: 'Antwerp feeder 4412', risk: fact(base + this.wob(1, 40, 0.06), 'none', 0.74, 'flow-v4.2', at, ['EV-1']), teu: 1240 },
      { id: 'SIN-BOM-2210', label: 'Mumbai 2210', risk: fact(base * 0.7 + this.wob(2, 33, 0.05), 'none', 0.71, 'flow-v4.2', at, ['EV-1']), teu: 860 },
      { id: 'SIN-PUS-8801', label: 'Busan 8801', risk: fact(base * 0.5 + this.wob(3, 51, 0.04), 'none', 0.69, 'flow-v4.2', at, ['EV-1']), teu: 640 },
      { id: 'SIN-DLC-3390', label: 'Dalian 3390', risk: fact(base * 0.35 + this.wob(4, 44, 0.03), 'none', 0.66, 'flow-v4.2', at, ['EV-1']), teu: 410 },
    ];
  }

  private cone(_at: SimInstant): ConfidenceCone {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = this.t + i * 3 * HOUR;
      const spread = Math.pow(i / 24, 1.35) * 5.2;
      const p50 = 6 + Math.sin(i / 5) * 0.7;
      pts.push({ t, p10: p50 - spread, p50, p90: p50 + spread * 1.25 });
    }
    return { subject: 'berthWindow', subjectId: 'T2', points: pts, n: 128, modelVersion: 'flow-v4.2' };
  }

  private berths(_at: SimInstant): BerthState[] {
    return this.world.berths.map((b, i) => ({
      id: b.id,
      ...(i === 1 ? { vesselId: this.world.vessel.id, vesselName: this.world.vessel.name } : {}),
      window: [this.t - 2 * HOUR, this.t + 12 * HOUR] as [number, number],
      craneIds: this.world.cranes.filter(c => c.x >= b.x0 && c.x < b.x1).map(c => c.id),
      movesRemaining: i === 1 ? 3180 + Math.round(this.wob(i, 90, 120)) : 0,
    }));
  }

  private cranes(_at: SimInstant): CraneState[] {
    return this.world.cranes.map((c, i) => {
      const active = c.x >= 300 && c.x <= 700;
      const d = this.derate[c.id] ?? (c.id === 'AQC-104' ? 0.25 : 0);
      return {
        id: c.id, x: c.x,
        trolley: active ? 0.5 + this.wob(i * 1.7, 0.9, 0.45) : 0.1,
        hoist: active ? 0.55 + this.wob(i * 1.7 + 1.2, 0.9, 0.4) : 0.95,
        deratePct: d,
        movesPerHr: active ? (32 - d * 32) + this.wob(i, 12, 1.4) : 0,
      };
    });
  }

  private fleet(): VehicleState[] {
    const out: VehicleState[] = [];
    const lanes = this.world.lanes;
    for (let i = 0; i < 18; i++) {
      const lane = lanes[i % lanes.length]!;
      const speed = 18 + (i % 5) * 1.4;                       // m per sim-minute
      const x = ((this.t / 60_000) * speed + i * 97) % this.world.quayLength;
      const dir = i % 2 === 0 ? 1 : -1;
      out.push({
        id: `AGV-${String(i + 1).padStart(2, '0')}`, kind: 'AGV',
        x: dir > 0 ? x : this.world.quayLength - x,
        z: lane.z + (i % 3) * 1.6, heading: dir > 0 ? 0 : Math.PI,
        laden: i % 3 !== 0, soc: 0.42 + ((i * 7) % 50) / 100, kwhPerMove: 3.1 + (i % 4) * 0.22,
      });
    }
    for (let i = 0; i < 8; i++) {
      const b = this.world.blocks[i * 2]!;
      out.push({
        id: `ASC-${String(i + 1).padStart(2, '0')}`, kind: 'ASC',
        x: b.x + b.rows * b.rowPitch * 0.5,
        z: b.z + (0.5 + 0.4 * Math.sin(this.t / 240_000 + i)) * b.bays * b.bayPitch,
        heading: 0, laden: i % 2 === 0, soc: 1, kwhPerMove: 4.4,
      });
    }
    return out;
  }

  private stacks(pre: boolean): BlockState[] {
    // Shape only — the real kernel owns the box-level stack. Surfaces must not
    // depend on this being complete; they read dig results and world geometry.
    return this.world.blocks.slice(0, 4).map(b => ({
      id: b.id, rows: b.rows, bays: b.bays, maxTier: b.maxTier,
      boxes: [], targets: [],
    })).map(s => (pre ? { ...s } : s));
  }

  private dig(at: SimInstant, pre: boolean): DigResult {
    const targets = 850;
    const blockers = pre ? 240 : 490;
    const unproductive = pre ? 730 : 1340;
    return {
      productive: fact(targets, 'moves', 0.96, 'stack-v3', at, ['EV-STACK-1']),
      unproductive: fact(unproductive, 'moves', 0.94, 'stack-v3', at, ['EV-STACK-1']),
      ascSeconds: fact(unproductive * 96, 's', 0.9, 'stack-v3', at, ['EV-STACK-1']),
      meanDigDepth: fact(pre ? 1.3 : 2.4, 'tiers', 0.94, 'stack-v3', at, ['EV-STACK-1']),
      byRow: Array.from({ length: 10 }, (_, i) => ({
        row: i, blockers: Math.round(blockers / 10 + this.wob(i, 25, 6)), targets: Math.round(targets / 10),
      })),
    };
  }

  private presequence(at: SimInstant): PresequenceResult {
    const movesNow = 290, saved = 610;
    const band = bandFor(0.91, 0.12, 0.95, this.bands);
    return {
      movesNow: fact(movesNow, 'moves', 0.91, 'stack-v3', at, ['EV-STACK-1']),
      movesSaved: fact(saved, 'moves', 0.88, 'stack-v3', at, ['EV-STACK-1']),
      net: fact(saved - movesNow, 'moves', 0.88, 'stack-v3', at, ['EV-STACK-1'], band),
      ascIdleUsedPct: fact(74, 'pct', 0.93, 'fleet-v2', at, ['EV-FLEET-1']),
      window: [this.t + 8 * HOUR, this.t + 12 * HOUR],
      band,
    };
  }

  private gate(at: SimInstant, pre: boolean): GateState {
    const r = this.rngAt(11);
    const windows: AppointmentWindow[] = [];
    for (let i = 0; i < 48; i++) {
      const t0 = this.t + i * 1800_000;
      const cap = 34;
      const firm = Math.max(0, Math.round(cap * 0.62 + gauss(r, 0, 3)));
      const prov = Math.max(0, Math.round(cap * 0.22 + gauss(r, 0, 2)));
      windows.push({
        id: `W${i}`, span: [t0, t0 + 1800_000], capacity: cap,
        firm: fact(firm, 'slots', 0.86, 'peer-haulier-v1', at, ['PEER-HAUL-1']),
        provisional: fact(prov, 'slots', 0.62, 'peer-haulier-v1', at, ['PEER-HAUL-1']),
        released: fact(Math.max(0, cap - firm - prov), 'slots', 0.86, 'peer-haulier-v1', at, ['PEER-HAUL-1']),
        arrivalsSoFar: i === 0 ? 22 : 0,
        invalidated: !pre && i >= 6 && i <= 12,
      });
    }
    const queue = pre ? 22 : 41;
    const split = { queueWait: pre ? 9 : 19, service: 11, yardInterchange: pre ? 8 : 12 };
    return {
      lanes: Array.from({ length: 12 }, (_, i) => ({
        id: `L${i + 1}`, open: i < (pre ? 12 : 10),
        serviceRatePerHr: fact(28 + this.wob(i, 18, 2.2), 'trucks', 0.9, 'gate-v2', at, ['EV-GATE-1']),
        serving: i < (pre ? 12 : 10) ? 1 : 0,
      })),
      queueLength: fact(queue + Math.round(this.wob(5, 22, 4)), 'trucks', 0.95, 'gate-v2', at, ['EV-GATE-1']),
      truckTurnTimeMin: fact(split.queueWait + split.service + split.yardInterchange, 'min', 0.88, 'gate-v2', at, ['EV-GATE-1', 'EV-STACK-1']),
      ttSplit: split,
      windows,
    };
  }

  private health(at: SimInstant): AssetHealth[] {
    return this.world.cranes.map((c, i) => {
      const hot = c.id === 'AQC-104';
      const damage = hot ? 0.62 : 0.08 + (i % 4) * 0.05;
      return {
        id: c.id,
        windingTempC: (hot ? 118 : 78) + this.wob(i * 2.1, 7, hot ? 5 : 2),
        vibrationRms: (hot ? 7.4 : 2.6) + this.wob(i * 3.3, 4, hot ? 0.9 : 0.3),
        hoistCurrentA: (hot ? 402 : 318) + this.wob(i, 3, 14),
        envelope: { tempC: 105, vibRms: 6.3, currentA: 440 },
        rulHours: fact(hot ? 412 : 3800 - i * 120, 'h', hot ? 0.81 : 0.66, 'thermal-v1', at, ['EV-TELEM-1']),
        damage,
      };
    });
  }

  private kpis(at: SimInstant, dig: DigResult, gate: GateState, pre: boolean): KpiSet {
    const L = ['EV-1'];
    const mph = 28.4 + this.wob(9, 17, 1.1) + (pre ? 2.6 : 0);
    return {
      vesselTurnaroundH: fact((pre ? 21.4 : 32.8) + this.wob(1, 45, 0.6), 'h', 0.79, 'berth-solver-v2', at, L),
      movesPerHour: fact(mph, 'movesPerHr', 0.92, 'berth-solver-v2', at, L),
      yardDigMoves: dig.unproductive,
      yardRehandleRate: fact(pre ? 0.18 : 0.29, 'none', 0.9, 'stack-v3', at, L),
      truckTurnTimeMin: gate.truckTurnTimeMin,
      gateSlotsForfeited: fact(pre ? 46 : 340, 'slots', 0.84, 'gate-v2', at, L),
      connectionsAtRisk: fact(pre ? 1 : 4, 'none', 0.77, 'flow-v4.2', at, L),
      teuAtRisk: fact(pre ? 640 : 3150, 'TEU', 0.75, 'flow-v4.2', at, L),
      energyKwhPerMove: fact(3.42 + this.wob(6, 28, 0.11), 'kWh', 0.88, 'energy-v1', at, L),
      co2gPerMove: fact(1420 + this.wob(7, 31, 40), 'gCO2e', 0.82, 'energy-v1', at, L),
      demurrageExposure: fact(pre ? 104000 : 486000, 'SGD', 0.7, 'commercial-v1', at, L),
      assetAvailabilityPct: fact(94.2 + this.wob(8, 60, 0.8), 'pct', 0.9, 'thermal-v1', at, L),
      anchorageWaitH: fact(8.4, 'h', 0.86, 'berth-solver-v2', at, L),
      fuelTonnesSaved: fact(0, 't', 0.71, 'voyage-v1', at, L),
    };
  }

  private regret(at: SimInstant): RegretDelta | null {
    if (this.forkedAt === null) return null;
    const mins = Math.max(0, (this.t - this.forkedAt) / 60_000);
    const rate = 3480;
    const f = (v: number, u: Fact<number>['unit']) => fact(v, u, 0.81, 'diff-v1', at, ['EV-FORK-1']);
    return {
      against: 'A', branch: 'B',
      sgdPerMinute: f(rate, 'SGD'),
      cumulativeSgd: f(rate * mins, 'SGD'),
      co2DeltaT: f(0.42 * mins, 'tCO2e'),
      teuAtRiskDelta: f(2510, 'TEU'),
      truckHoursLost: f(1.9 * mins, 'h'),
      connectionsLostDelta: f(3, 'none'),
    };
  }

  /** The federation set-piece. Counts cross; the job list does not. */
  answerPeer(party: string): PeerAnswer {
    const at = this.instant('A');
    if (party === 'haulier') {
      return {
        query: {
          askingParty: 'PSA-TUAS', askedParty: 'HAUL-A', party: 'haulier',
          subject: 'firmSlotCount', scope: { ref: 'sha256:9f2c…a1', horizonH: 3 },
          purpose: 'Re-plan the 06:00–09:00 gate window after a 14h vessel shift',
        },
        answer: fact(218, 'slots', 0.86, 'peer-haulier-v1', at, ['PEER-HAUL-1']),
        disclosed: [
          { field: 'firmSlots', value: '218', reason: 'needed to size the window' },
          { field: 'provisionalSlots', value: '84', reason: 'needed to size the buffer' },
          { field: 'releasedSlots', value: '38', reason: 'capacity we can re-offer' },
          { field: 'confidence', value: '0.86', reason: 'so the terminal can weight it' },
        ],
        withheld: [
          { field: 'jobList (2,400 records)', reason: 'reveals our customer book to a terminal that also serves our competitors' },
          { field: 'customerNames', reason: 'commercially confidential' },
          { field: 'driverRosters', reason: 'personal data, and our own sequencing' },
          { field: 'ourPricing', reason: 'commercially confidential' },
        ],
        latencyMs: 214,
      };
    }
    return {
      query: {
        askingParty: 'PSA-TUAS', askedParty: 'CARR-1', party: 'carrier',
        subject: 'stowageDeltaSummary', scope: { ref: 'sha256:41b0…7e', horizonH: 12 },
        purpose: 'Size the discharge sequence change',
      },
      answer: fact(0.18, 'none', 0.74, 'peer-carrier-v1', at, ['PEER-CARR-1']),
      disclosed: [
        { field: 'deltaFraction', value: '0.18', reason: 'sizes the re-plan' },
        { field: 'reeferCount', value: '312', reason: 'plug capacity' },
        { field: 'dgPresent', value: 'true', reason: 'segregation legality' },
        { field: 'confidence', value: '0.74', reason: 'weighting' },
      ],
      withheld: [
        { field: 'fullBayPlan', reason: 'not shared before arrival' },
        { field: 'bookingBook', reason: 'commercially confidential' },
        { field: 'rateCard', reason: 'commercially confidential' },
        { field: 'otherTerminalCalls', reason: 'not ours to share' },
      ],
      latencyMs: 168,
    };
  }
}
