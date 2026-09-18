/**
 * THE SCENARIO MODELS.
 *
 * Each scenario is a small coupled model, not a script. The operator moves one
 * control; every number downstream is computed from it. Nobody writes the
 * cause-and-effect chain — the sway model writes a number, the berth solver
 * reads it, the flow model reads that. Which is why an executive can move the
 * slider somewhere the rehearsal never went and still get an answer.
 */
import type {
  ScenarioId, ScenarioState, PropagationStep, Adaptation, Comparison,
  KpiSet, SimInstant, DecisionBand, LensId, AudienceSignal, LensFacet, Threshold,
} from '../index';
import { fact, bandFor, DEFAULT_BANDS } from '../fact';
import { solve, type AgentSpec, type Solved } from './solver';
import type { AgentId } from '../solve';

/** The cast, with the ones that have no stake in a disturbance shown dark. */
const CAST: Record<AgentId, { label: string; mandate: string }> = {
  berth: { label: 'Berth', mandate: 'crane split, berth windows, re-berthing' },
  yard: { label: 'Yard', mandate: 'pre-marshalling, stack depth, block sequencing' },
  landside: { label: 'Landside', mandate: 'truck appointments, gate flow, re-offers' },
  fleet: { label: 'Fleet', mandate: 'horizontal transport, pooling, charging' },
  voyage: { label: 'Voyage', mandate: 'passage speed, berth window publication' },
};
const spec = (
  id: AgentId, engaged: boolean,
  space: readonly { id: string; label: string; apply: string | null }[],
): AgentSpec => ({ id, label: CAST[id].label, mandate: CAST[id].mandate, engaged, space });

/**
 * Where the options are already a short, well-understood list, the agents still
 * price every one of them through the same coupled models — so the ranking and
 * the recommendation are searched rather than asserted, even when the space is
 * small enough to write down.
 */
function solveCurated(
  lens: LensId, baseline: KpiSet, run: (id: string | null) => KpiSet,
  groups: readonly { agent: AgentId; ids: readonly { id: string; label: string }[] }[],
  conflicts: readonly (readonly [string, string, string])[] = [],
): Solved {
  const specs = (Object.keys(CAST) as AgentId[]).map(a => {
    const g = groups.find(x => x.agent === a);
    return spec(a, g !== undefined, g
      ? [{ id: 'noop', label: 'Do nothing', apply: null }, ...g.ids.map(x => ({ ...x, apply: x.id }))]
      : []);
  });
  return solve({ lens, baseline, run, specs, conflicts });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;
const NOMINAL_RATE = 32;

/* --------------------------------------------------------------- the KPIs -- */

interface Ops {
  movesPerHr: number; cranes: number; movesRemaining: number;
  digMoves: number; truckTurnMin: number; slotsLost: number;
  connsAtRisk: number; teuAtRisk: number; kwhPerMove: number;
  demurrage: number; availability: number;
  /** only the improvement scenario moves these; everything else sits at zero */
  anchorageH?: number; fuelSavedT?: number;
}

function kpiSet(o: Ops, at: SimInstant, model: string): KpiSet {
  const L = ['EV-SCEN-1'];
  const turnaround = o.movesRemaining / Math.max(1, o.movesPerHr * o.cranes);
  return {
    vesselTurnaroundH: fact(turnaround, 'h', 0.82, model, at, L),
    movesPerHour: fact(o.movesPerHr, 'movesPerHr', 0.93, model, at, L),
    yardDigMoves: fact(o.digMoves, 'moves', 0.94, 'stack-v3', at, L),
    yardRehandleRate: fact(o.digMoves / (o.digMoves + BLOCK_3C.parcel), 'none', 0.9, 'stack-v3', at, L),
    truckTurnTimeMin: fact(o.truckTurnMin, 'min', 0.88, 'gate-v2', at, L),
    gateSlotsForfeited: fact(o.slotsLost, 'slots', 0.84, 'gate-v2', at, L),
    connectionsAtRisk: fact(o.connsAtRisk, 'none', 0.77, 'flow-v4.2', at, L),
    teuAtRisk: fact(o.teuAtRisk, 'TEU', 0.75, 'flow-v4.2', at, L),
    energyKwhPerMove: fact(o.kwhPerMove, 'kWh', 0.88, 'energy-v1', at, L),
    co2gPerMove: fact(o.kwhPerMove * 412, 'gCO2e', 0.82, 'energy-v1', at, L),
    demurrageExposure: fact(o.demurrage, 'SGD', 0.7, 'commercial-v1', at, L),
    assetAvailabilityPct: fact(o.availability, 'pct', 0.9, 'thermal-v1', at, L),
    anchorageWaitH: fact(o.anchorageH ?? 0, 'h', 0.86, 'berth-solver-v2', at, L),
    fuelTonnesSaved: fact(o.fuelSavedT ?? 0, 't', 0.71, 'voyage-v1', at, L),
  };
}

const CONNECTIONS = [
  { id: 'SIN-ANR-4412', teu: 1240, slack: 4.5 },
  { id: 'SIN-BOM-2210', teu: 860, slack: 7.0 },
  { id: 'SIN-PUS-8801', teu: 640, slack: 9.5 },
  { id: 'SIN-DLC-3390', teu: 410, slack: 13.0 },
];

/** A connection breaks when the delay eats its slack. Nothing else decides it. */
function connectionsHit(delayH: number) {
  const hit = CONNECTIONS.filter(c => delayH > c.slack);
  return { count: hit.length, teu: hit.reduce((s, c) => s + c.teu, 0) };
}

const band = (conf: number, blast: number, rev: number): DecisionBand =>
  bandFor(conf, blast, rev, DEFAULT_BANDS);

function comparison(
  baseline: KpiSet, adapted: KpiSet, adaptedB: KpiSet | null,
  chosen: string | null, chosenB: string | null, at: SimInstant,
  extraSgd = 0,
): Comparison {
  const dH = baseline.vesselTurnaroundH.value - adapted.vesselTurnaroundH.value;
  const dTeu = baseline.teuAtRisk.value - adapted.teuAtRisk.value;
  /* An unproductive move is not free: ASC time, energy and the quay it starves.
     Without this a pre-marshalling plan saves 362 moves and prices at zero,
     which is the kind of silence that makes an operator distrust the panel. */
  const dMoves = baseline.yardDigMoves.value - adapted.yardDigMoves.value;
  const L = ['EV-DIFF-1'];
  return {
    baseline, adapted, adaptedB, chosen, chosenB,
    deltaSgd: fact(
      baseline.demurrageExposure.value - adapted.demurrageExposure.value
      + dH * 21400 + dMoves * 38 + extraSgd,
      'SGD', 0.76, 'diff-v1', at, L),
    deltaTeu: fact(dTeu, 'TEU', 0.75, 'diff-v1', at, L),
    deltaHours: fact(dH, 'h', 0.8, 'diff-v1', at, L),
  };
}

/* ------------------------------------------------------------- the physics -- */

const SWAY_ENVELOPE = 0.8;
const swayAmplitude = (windKt: number, loadFactor = 1) => 0.35 + 0.00095 * windKt * windKt * loadFactor;
const rateUnderSway = (amp: number) =>
  amp <= SWAY_ENVELOPE ? NOMINAL_RATE : NOMINAL_RATE * clamp(Math.sqrt(SWAY_ENVELOPE / amp), 0.34, 1);

/* --------------------------------------------------------- the export stack -- */
/**
 * Re-handles are not a constant, and treating them as one was wrong. An export
 * parcel is pre-marshalled against a planned load sequence. While the call is
 * late, receivals keep landing on the same rows and bury it deeper, so the dig
 * grows with how STALE the plan is — until the block runs out of room to bury
 * anything else and the curve flattens. Every scenario that moves a departure
 * therefore moves this number too.
 */
const BLOCK_3C = {
  parcel: 850,        // export boxes booked to this call, in block 3C
  stacks: 240,        // distinct stacks the parcel is spread across
  baseBury: 0.86,     // re-handles per box out of a freshly pre-marshalled block
  landingRate: 58,    // boxes/h still being received onto those same rows
  capacity: 1180,     // what those rows can absorb before the block is full
  perLanding: 0.21,   // how much each landed box deepens the average dig
} as const;

/** Unproductive moves to retrieve the parcel when the plan is `staleH` old. */
export function digFor(staleH: number): number {
  const landed = Math.min(BLOCK_3C.capacity, BLOCK_3C.landingRate * Math.max(0, staleH));
  const bury = BLOCK_3C.baseBury + (landed / BLOCK_3C.stacks) * BLOCK_3C.perLanding;
  return Math.round(BLOCK_3C.parcel * bury);
}
/** What one pre-marshalling pass in the lull can take back. */
export const digRecoverable = (staleH: number) => Math.max(0, digFor(staleH) - digFor(0));
/** Boxes that actually have to be moved to recover it — the blockers. */
export const blockersFor = (staleH: number) => Math.round(digRecoverable(staleH) * 0.48);
/**
 * Today a berth window is only firm inside the terminal's own planning slack,
 * so a block that is never pre-marshalled is working to a plan this stale.
 */
const UNPLANNED_STALENESS = 14;

const VESSEL = { cranesDefault: 4, movesRemaining: 3180, nextCallIn: 30 };
const FLEET = { size: 18, cranes: 7, perCrane: 2.2, movesRemaining: 2400 };

/**
 * A cheap probe of the same maths the full model uses, so the thresholds
 * marked on the control can never disagree with what the model actually does.
 */
function probe(id: ScenarioId, v: number): { delayH: number; conns: number; extra: number } {
  if (id === 'monsoon-sway') {
    const rate = rateUnderSway(swayAmplitude(v));
    const nominal = FLEET.movesRemaining / (NOMINAL_RATE * FLEET.cranes);
    const delayH = FLEET.movesRemaining / (rate * FLEET.cranes) - nominal;
    return { delayH, conns: connectionsHit(delayH).count, extra: swayAmplitude(v) };
  }
  if (id === 'vessel-delay') {
    const turn = VESSEL.movesRemaining / (NOMINAL_RATE * VESSEL.cranesDefault);
    return { delayH: v, conns: connectionsHit(v).count, extra: Math.max(0, v + turn - VESSEL.nextCallIn) };
  }
  const pool = FLEET.size - v;
  const required = FLEET.cranes * FLEET.perCrane;
  const rate = NOMINAL_RATE * clamp(pool / required, 0.25, 1);
  const nominal = FLEET.movesRemaining / (NOMINAL_RATE * FLEET.cranes);
  const delayH = FLEET.movesRemaining / (rate * FLEET.cranes) - nominal;
  return { delayH, conns: connectionsHit(delayH).count, extra: rate };
}

/** Scan the control's range and mark where each consequence switches on. */
function thresholdsFor(id: ScenarioId, min: number, max: number, step: number): Threshold[] {
  const out: Threshold[] = [];
  const seen = new Set<string>();
  const push = (value: number, label: string, severity: Threshold['severity']) => {
    if (seen.has(label)) return;
    seen.add(label); out.push({ value, label, severity });
  };
  let prev = probe(id, min);
  for (let v = min + step; v <= max; v += step) {
    const p = probe(id, v);
    if (id === 'monsoon-sway' && prev.extra <= SWAY_ENVELOPE && p.extra > SWAY_ENVELOPE) {
      push(v, 'sway exceeds the landing envelope', 'watch');
    }
    if (id === 'vessel-delay' && prev.extra <= 0 && p.extra > 0) {
      push(v, 'the call overruns the next berth window', 'watch');
    }
    if (id === 'agv-reroute' && prev.extra >= 28 && p.extra < 28) {
      push(v, 'gang rate drops below 28', 'watch');
    }
    if (p.conns > prev.conns) {
      push(v, p.conns === 1 ? 'first connection rolls' : `${p.conns} connections rolled`,
        p.conns >= 2 ? 'alarm' : 'watch');
    }
    prev = p;
  }
  return out;
}

/* ----------------------------------------------------------- the audiences -- */

const LENS_LABEL: Record<LensId, string> = {
  operations: 'Operations', engineering: 'Engineering', safety: 'Safety',
  otsec: 'OT security', energy: 'Energy', commercial: 'Commercial',
  projects: 'Projects', group: 'Group',
};

type Sev = 0 | 1 | 2 | 3;
const sig = (lens: LensId, severity: Sev, headline: string): AudienceSignal =>
  ({ lens, label: LENS_LABEL[lens], severity, headline });

/* --------------------------------------------------------------- the facet -- */

const CLIP = {
  sway: 'inserts/sway.mp4', derate: 'inserts/derate.mp4', vessel: 'inserts/vessel.mp4',
  feeder: 'inserts/feeder.mp4', berth: 'inserts/berth.mp4', dig: 'inserts/dig.mp4',
  gate: 'inserts/gate.mp4', charging: 'inserts/charging.mp4', hook: 'inserts/starvedhook.mp4',
  agv: 'inserts/agv.mp4', reefers: 'inserts/reefers.mp4', machinery: 'inserts/machinery.mp4',
  yard: 'inserts/yardface.mp4', monsoon: 'plates/monsoon.mp4',
  /* the upside shots — a port working well, which nothing else in the kit had */
  planroom: 'inserts/planroom.mp4', economical: 'inserts/economical.mp4',
  ontime: 'inserts/ontime.mp4', anchorage: 'inserts/anchorage.mp4',
} as const;

interface FacetSpec {
  headline: string;
  kpis: (keyof KpiSet)[];
  overlays: LensFacet['overlays'];
  allowed: string[];
  retell?: Record<number, { title: string; detail: string; clip?: string }>;
}

function facetFor(lens: LensId, spec: FacetSpec | undefined, fallback: FacetSpec): LensFacet {
  const s = spec ?? fallback;
  return {
    lens, headline: s.headline, kpis: s.kpis, overlays: s.overlays,
    allowed: s.allowed, retell: s.retell ?? {},
  };
}

const GROUP_KPIS: (keyof KpiSet)[] =
  ['teuAtRisk', 'vesselTurnaroundH', 'demurrageExposure', 'truckTurnTimeMin', 'co2gPerMove', 'assetAvailabilityPct'];

/* ====================================================== S3 · MONSOON SWAY == */
/**
 * Physics first. A spreader on eight ropes is a driven pendulum; crosswind
 * drives it. When the swing exceeds what the automation can land safely, the
 * anti-sway controller lengthens the damping cycle and caps trolley
 * acceleration — and hoist rate falls as a CONSEQUENCE, not as a setting.
 */
function monsoon(v: number, lens: LensId, chosen: string | null, chosenB: string | null, at: SimInstant, phase: number): ScenarioState {
  const windKt = v;
  const cranes = FLEET.cranes, movesRemaining = FLEET.movesRemaining;
  const turnNominal = movesRemaining / (NOMINAL_RATE * cranes);

  const ampB = swayAmplitude(windKt);
  const rateB = rateUnderSway(ampB);
  const turnB = movesRemaining / (rateB * cranes);
  const delayB = turnB - turnNominal;
  const hitB = connectionsHit(delayB);

  const run = (id: string | null) => {
    let loadFactor = 1, craneCount = cranes, exposure = 1, extraDig = 0, reberth = 0;
    if (id === 'light-windward') { loadFactor = 0.72; extraDig = 180; }
    if (id === 'sheltered-berth') { exposure = 0.6; reberth = 3.2; }
    if (id === 'stop-quay') { craneCount = 0; }
    const amp = swayAmplitude(windKt * exposure, loadFactor);
    const rate = craneCount === 0 ? 0 : rateUnderSway(amp);
    const turn = craneCount === 0 ? turnNominal + 6 : movesRemaining / (rate * craneCount) + reberth;
    const delay = Math.max(0, turn - turnNominal);
    const hit = connectionsHit(delay);
    return kpiSet({
      movesPerHr: rate, cranes: Math.max(1, craneCount || cranes), movesRemaining,
      digMoves: digFor(delay) + extraDig, truckTurnMin: 42 + delay * 1.6,
      slotsLost: Math.round(delay * 26), connsAtRisk: hit.count, teuAtRisk: hit.teu,
      kwhPerMove: 3.42 + (NOMINAL_RATE - rate) * 0.021, demurrage: hit.teu * 154,
      availability: 94.2 - clamp((ampB - SWAY_ENVELOPE) * 4, 0, 9),
    }, at, 'sway-v1');
  };

  const baseline = run(null);
  const adapted = chosen ? run(chosen) : baseline;
  const adaptedB = chosenB ? run(chosenB) : null;

  const sev = (a: boolean, w: boolean) => (a ? 'alarm' : w ? 'watch' : 'ok') as PropagationStep['severity'];
  const gust = ampB * (1 + 0.16 * Math.sin(phase * Math.PI * 2));

  const chain: PropagationStep[] = [
    {
      scale: 'ASSET', clock: '50 ms', atMs: 50, because: '',
      title: 'Gust front crosses the quay', short: 'Gust front',
      detail: `Crosswind ${windKt.toFixed(0)} kt on the beam. The spreader is modelled as a driven pendulum on an 8-rope reeve.`,
      fact: fact(windKt, 'none', 0.95, 'wx-v1', at, ['EV-WX-1']),
      from: '9 kt', to: `${windKt.toFixed(0)} kt`,
      clip: CLIP.monsoon, severity: sev(windKt > 38, windKt > 24), anchor: [0.58, 0.50],
    },
    {
      scale: 'ASSET', clock: '2 s', atMs: 2 * SEC, because: 'so the load swings',
      title: 'Sway exceeds the landing envelope', short: 'Sway over envelope',
      detail: `Swing ${gust.toFixed(2)} m against an envelope of ${SWAY_ENVELOPE} m. Above it the automation cannot land a box first time.`,
      fact: fact(gust, 'none', 0.91, 'sway-v1', at, ['EV-TELEM-1']),
      from: `${SWAY_ENVELOPE} m`, to: `${ampB.toFixed(2)} m`,
      clip: CLIP.sway, severity: sev(ampB > SWAY_ENVELOPE * 1.6, ampB > SWAY_ENVELOPE), anchor: [0.67, 0.52],
    },
    {
      scale: 'TERMINAL', clock: '4 min', atMs: 4 * MIN, because: 'so anti-sway derates',
      title: 'Anti-sway control cuts the rate', short: 'Rate cut',
      detail: `Damping cycle lengthened, trolley acceleration capped. Hoist rate falls per crane. No human made that decision.`,
      fact: fact(rateB, 'movesPerHr', 0.93, 'sway-v1', at, ['EV-SWAY-1']),
      from: `${NOMINAL_RATE} mv/hr`, to: `${rateB.toFixed(0)} mv/hr`,
      clip: CLIP.derate, kpi: 'movesPerHour', severity: sev(rateB < 20, rateB < 28), anchor: [0.38, 0.61],
    },
    {
      scale: 'TERMINAL', clock: '6 h', atMs: 6 * HOUR, because: 'so the ship sails later',
      title: 'The sailing window slips', short: 'ETD slips',
      detail: `${movesRemaining.toLocaleString('en-SG')} moves across ${cranes} cranes. Turnaround ${turnNominal.toFixed(1)} h becomes ${turnB.toFixed(1)} h.`,
      fact: fact(delayB, 'h', 0.84, 'berth-solver-v2', at, ['EV-PLAN-1']),
      from: `${turnNominal.toFixed(1)} h`, to: `${turnB.toFixed(1)} h`,
      kpi: 'vesselTurnaroundH', clip: CLIP.vessel, severity: sev(delayB > 6, delayB > 2), anchor: [0.62, 0.585],
    },
    {
      scale: 'PORT', clock: '3 d', atMs: 3 * DAY, because: 'so a connection misses',
      title: hitB.count ? 'Cargo rolls to the next sailing' : 'Every connection is made',
      short: hitB.count ? 'Cargo rolled' : 'Connections made',
      detail: hitB.count
        ? `${hitB.count} transhipment connection${hitB.count > 1 ? 's' : ''} no longer make their window — ${hitB.teu.toLocaleString('en-SG')} TEU, including the 40 pharma reefers.`
        : 'Every downstream connection still has slack. Nothing has been promised away.',
      fact: fact(hitB.teu, 'TEU', 0.75, 'flow-v4.2', at, ['EV-CONN-1']),
      from: '0 TEU', to: `${hitB.teu.toLocaleString('en-SG')} TEU`,
      kpi: 'teuAtRisk', clip: CLIP.feeder, severity: sev(hitB.count >= 2, hitB.count >= 1), anchor: [0.30, 0.78],
    },
  ];

  const adaptations: Adaptation[] = [
    {
      id: 'light-windward', label: 'Light boxes to the windward cranes',
      rationale: 'A lighter load swings less for the same wind. Re-sequence so cranes 1–3 take empties and 20ft dry, and the heavy high-cubes go to the sheltered end.',
      costs: [fact(180, 'moves', 0.9, 'stack-v3', at, [])],
      saves: [fact(Math.max(0, rateUnderSway(swayAmplitude(windKt, 0.72)) - rateB), 'movesPerHr', 0.88, 'sway-v1', at, [])],
      band: band(0.88, 0.14, 0.95), recommended: windKt >= 25 && windKt < 50,
    },
    {
      id: 'sheltered-berth', label: 'Shift the call to the sheltered berth',
      rationale: 'T1 sits behind the breakwater and sees roughly 60% of the open-quay wind. Costs a re-berth and the tugs, buys back most of the rate.',
      costs: [fact(3.2, 'h', 0.86, 'berth-solver-v2', at, [])],
      saves: [fact(Math.max(0, rateUnderSway(swayAmplitude(windKt * 0.6)) - rateB), 'movesPerHr', 0.83, 'sway-v1', at, [])],
      band: band(0.79, 0.42, 0.55), recommended: windKt >= 50 && windKt < 58,
    },
    {
      id: 'stop-quay', label: 'Stop the quay and take the delay',
      rationale: 'The safe answer. Everything waits for the front to pass, and the whole delay lands on the departure window.',
      costs: [fact(6, 'h', 0.9, 'berth-solver-v2', at, [])],
      saves: [fact(0, 'movesPerHr', 0.9, 'sway-v1', at, [])],
      band: band(0.95, 0.78, 0.9), recommended: windKt >= 58,
    },
  ];

  const over = ampB > SWAY_ENVELOPE;
  const audiences: AudienceSignal[] = [
    sig('engineering', over ? 3 : 1, `Crane 4 is accruing fatigue ${over ? 'faster than the maintenance plan assumes' : 'within plan'}.`),
    sig('operations', rateB < 28 ? 3 : 1, `Gang rate ${rateB.toFixed(0)} mv/hr. ${rateB < 28 ? 'The hook is starving and the AGV pool is queueing.' : 'Quay is running to plan.'}`),
    sig('safety', windKt >= 48 ? 3 : windKt >= 30 ? 2 : 0, windKt >= 48
      ? 'Above 48 kt no lift may cross the lashing bridge. The lifting envelope is effectively closed.'
      : windKt >= 30 ? 'Wind exclusion zones widening around the quay cranes.' : 'Nothing outside normal limits.'),
    sig('commercial', hitB.count >= 2 ? 3 : hitB.count ? 2 : 0, hitB.count
      ? `${hitB.teu.toLocaleString('en-SG')} TEU you have already sold a window to is now at risk.`
      : 'No connection has moved. Nothing to tell a customer.'),
    sig('energy', over ? 2 : 0, over
      ? 'Regenerative braking is down with the slower cycle; hotel load and shore-power draw are both up.'
      : 'Consumption nominal.'),
    sig('otsec', 0, 'No control-network involvement. Anti-sway is a local loop.'),
    sig('projects', windKt >= 40 ? 1 : 0, windKt >= 40
      ? 'Boom anemometer commissioning on crane 6 is outstanding — this is the weather it was specified for.'
      : 'Nothing outstanding.'),
    sig('group', hitB.teu > 1500 ? 3 : hitB.count ? 2 : 1,
      `${hitB.teu.toLocaleString('en-SG')} TEU exposed, turnaround ${turnB.toFixed(1)} h.`),
  ];

  const FALLBACK: FacetSpec = {
    headline: 'This disturbance barely reaches your desk.',
    kpis: ['movesPerHour', 'vesselTurnaroundH', 'teuAtRisk'], overlays: [], allowed: [],
  };
  const SPECS: Partial<Record<LensId, FacetSpec>> = {
    operations: {
      headline: 'The quay is slowing and you have three shifts of work to re-plan.',
      kpis: ['movesPerHour', 'vesselTurnaroundH', 'truckTurnTimeMin', 'yardDigMoves'],
      overlays: ['berthWindows', 'agvFlow', 'exceptionPins'],
      allowed: ['light-windward', 'sheltered-berth', 'stop-quay'],
      retell: {
        2: { title: 'Your gang rate just fell', detail: `Every crane on the vessel is derated. You are working ${rateB.toFixed(0)} against a plan built on ${NOMINAL_RATE}.` },
        3: { title: 'The shift plan no longer closes', detail: `Turnaround runs ${turnB.toFixed(1)} h. The next gang change lands mid-discharge.` },
      },
    },
    engineering: {
      headline: 'Every over-envelope swing is fatigue you do not get back.',
      kpis: ['assetAvailabilityPct', 'movesPerHour', 'energyKwhPerMove'],
      overlays: ['healthHalos', 'loadSpectra', 'dutyCycle'],
      allowed: ['light-windward'],
      retell: {
        1: { title: 'Load spectrum outside envelope', clip: CLIP.machinery, detail: `Swing ${ampB.toFixed(2)} m drives lateral loading into the trolley rails and the hoist reeve. Damage accrues per cycle, not per hour.` },
        2: { title: 'The controller is protecting the machine', detail: 'Anti-sway is doing its job. The rate loss is the cost of not writing off a spreader.' },
      },
    },
    safety: {
      headline: windKt >= 48 ? 'The lifting envelope is closed. Nothing crosses the lashing bridge.' : 'Exclusion zones are widening around every working crane.',
      kpis: ['assetAvailabilityPct', 'movesPerHour'],
      overlays: ['exclusionZones', 'proximity', 'plume'],
      allowed: ['stop-quay'],
      retell: {
        1: { title: 'Swing radius breaches the exclusion zone', detail: `A ${ampB.toFixed(2)} m swing at 25 m puts the load outside the modelled drop envelope. Lashing gangs on deck are inside it.` },
        4: { title: 'Nobody is hurt, and that is the point', detail: 'The delay is what the safe answer costs. It is worth naming out loud.' },
      },
    },
    commercial: {
      headline: hitB.count ? 'You have sold windows that will not hold.' : 'Every window you sold still holds.',
      kpis: ['connectionsAtRisk', 'teuAtRisk', 'demurrageExposure', 'gateSlotsForfeited'],
      overlays: ['connectionThreads', 'freeTimeRings', 'pharmaThread'],
      allowed: ['sheltered-berth'],
      retell: {
        3: { title: 'The berth window you quoted slips', detail: `The window you quoted slips by ${delayB.toFixed(1)} h.` },
        4: { title: 'Which customers you have to call', clip: CLIP.reefers, detail: hitB.count ? `${hitB.count} connections, ${hitB.teu.toLocaleString('en-SG')} TEU, and 40 reefers on a temperature commitment.` : 'None yet.' },
      },
    },
    energy: {
      headline: 'Slower cycles mean less regeneration and more hotel load.',
      kpis: ['energyKwhPerMove', 'co2gPerMove', 'movesPerHour'],
      overlays: ['carbonRibbon', 'microgrid', 'shorePower'], allowed: [],
      retell: { 2: { title: 'Energy per move rises', detail: 'Longer damping cycles do not regenerate. Each box costs more to move in this wind.' } },
    },
    group: {
      headline: 'One weather front, and a sailing you may not make.',
      kpis: GROUP_KPIS, overlays: ['rollupFrame'], allowed: [],
      retell: {
        0: { title: 'Weather, not a failure', detail: 'Nothing is broken. The port is doing exactly what it should, and it still costs you.' },
        4: { title: 'Volume exposed', detail: `${hitB.teu.toLocaleString('en-SG')} TEU and the customers attached to it.` },
      },
    },
  };

  return {
    id: 'monsoon-sway', label: 'Monsoon — crane sway',
    subtitle: 'One gust, four clocks. Physics becomes rolled cargo.',
    plate: windKt >= 30 ? 'monsoon' : 'clear', scale: 'ASSET',
    disturbance: {
      label: 'Crosswind on the quay', unit: 'none', min: 0, max: 65, step: 1, value: windKt,
      caption: `${windKt.toFixed(0)} kt · sway ${ampB.toFixed(2)} m · envelope ${SWAY_ENVELOPE} m`,
    },
    chain, adaptations,
    comparison: comparison(baseline, adapted, adaptedB, chosen, chosenB, at),
    weather: {
      windKt, rain: clamp((windKt - 18) / 40, 0, 1),
      visibility: clamp(1 - (windKt - 22) / 55, 0.25, 1), gustPhase: phase,
    },
    audiences, facet: facetFor(lens, SPECS[lens], FALLBACK),
    thresholds: thresholdsFor('monsoon-sway', 0, 65, 1),
    polarity: 'disturbance', optimum: null,
    solve: solveCurated(lens, baseline, run, [
      { agent: 'berth', ids: [
        { id: 'sheltered-berth', label: 'Shift the call to the sheltered berth' },
        { id: 'stop-quay', label: 'Stop the quay and take the delay' },
      ] },
      { agent: 'yard', ids: [{ id: 'light-windward', label: 'Light boxes to the windward cranes' }] },
    ], [
      ['sheltered-berth', 'stop-quay', 'the call is already moving behind the breakwater — stopping the quay as well pays the same delay twice'],
    ]).result,
    fixed: chosen === 'sheltered-berth' ? [2, 3] : chosen === 'light-windward' ? [1] : [],
    cranes: chosen === 'stop-quay' ? 0 : FLEET.cranes,
    dig: adapted.yardDigMoves.value,
    preview: null,   // the kernel fills this when a plan is being projected
    insert: 'inserts/sway.mp4',
  };
}

/* ====================================================== S1 · VESSEL DELAY == */
function vesselDelay(v: number, lens: LensId, chosen: string | null, chosenB: string | null, at: SimInstant, phase: number): ScenarioState {
  const delayH = v;
  const cranes = VESSEL.cranesDefault, movesRemaining = VESSEL.movesRemaining;
  const turnNominal = movesRemaining / (NOMINAL_RATE * cranes);
  const collisionB = Math.max(0, delayH + turnNominal - VESSEL.nextCallIn);
  const hitB = connectionsHit(delayH);
  const slotsB = Math.round(delayH * 24);

  /**
   * The action space the berth, yard and landside agents search. Each id is a
   * real setting of the same model, not a label — which is what lets an agent
   * find "six cranes" when nobody wrote a six-crane option.
   */
  const run = (id: string | null) => {
    let craneCount = cranes, shift = 0, dig = 0, recovered = 0;
    if (id !== null && id.startsWith('surge-')) craneCount = Number(id.slice(6));
    if (id === 'reberth-t3') shift = -collisionB;
    if (id === 'reberth-t4') shift = -collisionB * 0.6;
    if (id !== null && id.startsWith('premarshal-')) dig = -digRecoverable(delayH) * (Number(id.slice(11)) / 100);
    if (id !== null && id.startsWith('reoffer-')) recovered = Math.round(slotsB * (Number(id.slice(8)) / 100));
    const turn = movesRemaining / (NOMINAL_RATE * craneCount);
    const effective = Math.max(0, delayH - (turnNominal - turn));
    const hit = connectionsHit(effective);
    const coll = Math.max(0, delayH + turn + shift - VESSEL.nextCallIn);
    return kpiSet({
      movesPerHr: NOMINAL_RATE, cranes: craneCount, movesRemaining,
      digMoves: digFor(delayH) + dig, truckTurnMin: 42 + coll * 1.1,
      slotsLost: Math.max(0, slotsB - recovered),
      connsAtRisk: hit.count, teuAtRisk: hit.teu,
      kwhPerMove: 3.42, demurrage: hit.teu * 154, availability: 94.2,
    }, at, 'berth-solver-v2');
  };

  const baseline = run(null);
  const adapted = chosen ? run(chosen) : baseline;
  const adaptedB = chosenB ? run(chosenB) : null;

  const sev = (a: boolean, w: boolean) => (a ? 'alarm' : w ? 'watch' : 'ok') as PropagationStep['severity'];
  /* the parcel is only "buried" once enough receivals have landed on it to be
     worth a pre-marshalling pass — below that the block is simply clean */
  const buried = digRecoverable(delayH) >= 40;
  const chain: PropagationStep[] = [
    {
      scale: 'PORT', clock: 'now', atMs: 60 * SEC, because: '',
      title: 'Carrier revises the ETA', short: 'ETA revised',
      detail: `MV KESTREL SPIRIT, 24,000 TEU. Her ETA has slipped ${delayH.toFixed(0)} h. We do not model the upstream port — we receive its consequence.`,
      fact: fact(delayH, 'h', 0.78, 'flow-v4.2', at, ['EV-AIS-1']),
      from: 'on time', to: `${delayH.toFixed(0)} h late`,
      clip: CLIP.vessel, severity: sev(delayH > 12, delayH > 4), anchor: [0.62, 0.575],
    },
    {
      scale: 'TERMINAL', clock: '20 min', atMs: 20 * MIN, because: 'so the berth plan re-solves',
      title: collisionB > 0 ? 'The call overruns the next berth window' : 'The call still fits its berth window',
      short: collisionB > 0 ? 'Berth overrun' : 'Window holds',
      detail: collisionB > 0
        ? `T2 now overruns the following call by ${collisionB.toFixed(1)} h. Two ultra-large vessels want the same quay.`
        : 'T2 absorbs the delay inside its own window. The following call is untouched.',
      fact: fact(collisionB, 'h', 0.85, 'berth-solver-v2', at, ['EV-PLAN-1']),
      from: '0 h', to: `${collisionB.toFixed(1)} h`,
      kpi: 'vesselTurnaroundH', clip: CLIP.berth, severity: sev(collisionB > 3, collisionB > 0), anchor: [0.48, 0.60],
    },
    {
      scale: 'TERMINAL', clock: '2 h', atMs: 2 * HOUR, because: 'so the yard is staged wrong',
      title: buried ? 'The export parcel is buried' : 'The export parcel is still clean',
      short: buried ? 'Parcel buried' : 'Parcel clean',
      detail: buried
        ? `${BLOCK_3C.parcel} export boxes in block 3C were pre-marshalled for a window that no longer exists. ${delayH.toFixed(0)} h of receivals have landed on the same rows since, so the dig is now ${digFor(delayH).toLocaleString('en-SG')} unproductive moves against ${digFor(0).toLocaleString('en-SG')} on a clean block.`
        : `${BLOCK_3C.parcel} export boxes in block 3C are pre-marshalled to the load sequence. Nothing has landed on top of them yet, so the dig is the standing ${digFor(0).toLocaleString('en-SG')} moves.`,
      fact: fact(digFor(delayH), 'moves', 0.94, 'stack-v3', at, ['EV-STACK-1']),
      from: `${digFor(0).toLocaleString('en-SG')} moves`, to: `${digFor(delayH).toLocaleString('en-SG')} moves`,
      kpi: 'yardDigMoves', clip: CLIP.dig, severity: sev(delayH > 8, delayH > 3), anchor: [0.36, 0.83],
    },
    {
      scale: 'FLEET', clock: '12 h', atMs: 12 * HOUR, because: 'so appointments point at nothing',
      title: 'Truck appointments lapse', short: 'Slots lapse',
      detail: `${slotsB} export receival appointments are booked against a vessel that is not on the berth.`,
      fact: fact(slotsB, 'slots', 0.84, 'gate-v2', at, ['EV-GATE-1']),
      from: '0 slots', to: `${slotsB} slots`,
      kpi: 'gateSlotsForfeited', clip: CLIP.gate, severity: sev(delayH > 10, delayH > 4), anchor: [0.80, 0.70],
    },
    {
      scale: 'PORT', clock: '3 d', atMs: 3 * DAY, because: 'so a connection misses',
      title: hitB.count ? 'Cargo rolls to the next sailing' : 'Every connection is made',
      short: hitB.count ? 'Cargo rolled' : 'Connections made',
      detail: hitB.count
        ? `${hitB.count} connection${hitB.count > 1 ? 's' : ''} lose their window — ${hitB.teu.toLocaleString('en-SG')} TEU rolls.`
        : 'Every connection still has slack.',
      fact: fact(hitB.teu, 'TEU', 0.75, 'flow-v4.2', at, ['EV-CONN-1']),
      from: '0 TEU', to: `${hitB.teu.toLocaleString('en-SG')} TEU`,
      kpi: 'teuAtRisk', clip: CLIP.feeder, severity: sev(hitB.count >= 2, hitB.count >= 1), anchor: [0.24, 0.76],
    },
  ];

  /* ------------------------------------------------- the agents solve it -- */
  const AGENTS: AgentSpec[] = [
    spec('berth', true, [
      { id: 'noop', label: 'Leave the split alone', apply: null },
      ...[3, 4, 5, 6, 7].map(n => ({ id: `surge-${n}`, label: `Work the call with ${n} cranes`, apply: `surge-${n}` })),
      { id: 'reberth-t3', label: 'Re-berth the following call to T3', apply: 'reberth-t3' },
      { id: 'reberth-t4', label: 'Re-berth the following call to T4', apply: 'reberth-t4' },
    ]),
    spec('yard', digRecoverable(delayH) > 40, [
      { id: 'noop', label: 'Dig it out on the day', apply: null },
      ...[40, 60, 80, 100].map(p => ({ id: `premarshal-${p}`, label: `Pre-marshal ${p}% of 3C in the lull`, apply: `premarshal-${p}` })),
    ]),
    spec('landside', slotsB > 0, [
      { id: 'noop', label: 'Let the appointments lapse', apply: null },
      ...[25, 50, 75, 100].map(p => ({ id: `reoffer-${p}`, label: `Re-offer ${p}% of the lapsed slots`, apply: `reoffer-${p}` })),
    ]),
    spec('fleet', false, []),
    spec('voyage', false, []),
  ];

  /* Plans that cannot both happen. A curated list can never produce one of
     these, which is exactly why showing it resolved is worth the screen. */
  const CONFLICTS: (readonly [string, string, string])[] = [
    // a surged quay and a deep pre-marshalling pass want the same ASCs
    ...[6, 7].flatMap(n => [80, 100].map(pct => [
      `surge-${n}`, `premarshal-${pct}`,
      `${n} cranes on the call leaves no ASC capacity for a ${pct}% pre-marshalling pass in the same lull`,
    ] as const)),
    // and a call that is moving cannot have its old slots re-sold
    ...['reberth-t3', 'reberth-t4'].flatMap(r => [75, 100].map(pct => [
      r, `reoffer-${pct}`,
      `the call is moving to ${r.slice(-2).toUpperCase()} — re-offering ${pct}% of the slots against the T2 window would send hauliers to the wrong berth`,
    ] as const)),
  ];

  const solved: Solved = solve({ lens, baseline, run, specs: AGENTS, conflicts: CONFLICTS });

  /** Turn a searched action into something an operator can read and price. */
  const describe = (id: string): Adaptation => {
    const k = run(id);
    const saveH = baseline.vesselTurnaroundH.value - k.vesselTurnaroundH.value;
    if (id.startsWith('surge-')) {
      const n = Number(id.slice(6));
      return {
        id, label: `Surge the crane split from ${cranes} to ${n}`,
        rationale: n > cranes
          ? `Put ${n - cranes} more cranes on the call and claw the turnaround back. Costs the cranes working the feeder at T1.`
          : `Work the call with ${n} cranes and release the rest of the quay. Slower here, cheaper elsewhere.`,
        costs: [fact(Math.abs(n - cranes), 'none', 0.9, 'berth-solver-v2', at, [])],
        saves: [fact(Math.max(0, saveH), 'h', 0.87, 'berth-solver-v2', at, [])],
        band: band(0.9, 0.3, 0.9), recommended: false,
      };
    }
    if (id.startsWith('premarshal-')) {
      const p = Number(id.slice(11)) / 100;
      return {
        id, label: `Pre-marshal ${Math.round(p * 100)}% of 3C in the 18:00 lull`,
        rationale: `Shift ${Math.round(blockersFor(delayH) * p).toLocaleString('en-SG')} blockers while the ASCs sit at 26% utilisation, so the parcel is clean when the vessel does arrive.`,
        costs: [fact(Math.round(blockersFor(delayH) * p), 'moves', 0.91, 'stack-v3', at, [])],
        saves: [fact(Math.round(digRecoverable(delayH) * p), 'moves', 0.88, 'stack-v3', at, [])],
        band: band(0.91, 0.12, 0.95), recommended: false,
      };
    }
    if (id.startsWith('reoffer-')) {
      const p = Number(id.slice(8)) / 100;
      return {
        id, label: `Re-offer ${Math.round(p * 100)}% of the lapsed slots`,
        rationale: 'Price and re-offer the lapsed appointments, weighted by connection risk and free-time exposure. The offer crosses a party boundary, so a human confirms it.',
        costs: [fact(0, 'moves', 0.9, 'gate-v2', at, [])],
        saves: [fact(Math.round(slotsB * p), 'slots', 0.82, 'gate-v2', at, [])],
        band: band(0.82, 0.62, 0.7), recommended: false,
      };
    }
    const t4 = id === 'reberth-t4';
    return {
      id, label: `Re-berth the following call to ${t4 ? 'T4' : 'T3'}`,
      rationale: t4
        ? 'T4 is further out and only absorbs part of the overrun, but it is free tonight. Costs a longer feeder run.'
        : 'Give the overrun somewhere to go rather than compressing it. Costs a shift of the feeder programme.',
      costs: [fact(t4 ? 3.6 : 2.4, 'h', 0.84, 'berth-solver-v2', at, [])],
      saves: [fact(collisionB * (t4 ? 0.6 : 1), 'h', 0.85, 'berth-solver-v2', at, [])],
      band: band(0.84, 0.45, 0.6), recommended: false,
    };
  };

  const adaptations: Adaptation[] = solved.accepted.slice(0, 4).map((id, i) => ({
    ...describe(id), recommended: i === 0,
  }));

  const audiences: AudienceSignal[] = [
    sig('operations', collisionB > 0 ? 3 : 1, collisionB > 0
      ? `Two vessels want T2. You are re-planning berth, cranes and yard at once.`
      : 'The window absorbs it. Nothing to re-plan yet.'),
    sig('commercial', hitB.count ? 3 : delayH > 2 ? 2 : 0, hitB.count
      ? `${hitB.count} connections and ${slotsB} gate appointments to renegotiate.`
      : 'Windows hold, but the gate book is drifting.'),
    sig('engineering', chosen !== null && chosen.startsWith('surge-') ? 2 : 1,
      chosen !== null && chosen.startsWith('surge-')
        ? `${chosen.slice(6)} cranes on one call is duty cycle you had not planned for.`
        : 'No unusual duty. Business as usual.'),
    sig('safety', delayH >= 12 ? 2 : 0, delayH >= 12
      ? 'Discharge now runs through the night shift. Fatigue exposure and lighting both change.'
      : 'No change to exposure.'),
    sig('energy', delayH >= 10 ? 1 : 0, delayH >= 10
      ? 'Shore power draw shifts into the evening peak window.' : 'Draw profile unchanged.'),
    sig('otsec', 0, 'No control-network involvement.'),
    sig('projects', 0, 'Nothing outstanding on this berth.'),
    sig('group', hitB.teu > 1500 ? 3 : hitB.count ? 2 : 1,
      `${hitB.teu.toLocaleString('en-SG')} TEU exposed, ${slotsB} customer appointments invalid.`),
  ];

  const FALLBACK: FacetSpec = {
    headline: 'This one lands mostly on operations and commercial.',
    kpis: ['vesselTurnaroundH', 'connectionsAtRisk', 'teuAtRisk'], overlays: [], allowed: [],
  };
  const SPECS: Partial<Record<LensId, FacetSpec>> = {
    operations: {
      headline: 'Berth, cranes and yard all have to move together.',
      kpis: ['vesselTurnaroundH', 'movesPerHour', 'yardDigMoves', 'truckTurnTimeMin'],
      overlays: ['berthWindows', 'digHeat', 'exceptionPins'],
      allowed: ['surge-', 'premarshal-', 'reberth-'],
      retell: {
        1: collisionB > 0
          ? { title: 'Your berth plan breaks', detail: `T2 overruns by ${collisionB.toFixed(1)} h and the following call has nowhere to go.` }
          : { title: 'Your berth plan still closes', detail: 'T2 absorbs the slip inside its own window. The following call is untouched.' },
        2: buried
          ? { title: `${digRecoverable(delayH).toLocaleString('en-SG')} unproductive moves you have not budgeted`, clip: CLIP.yard, detail: `Block 3C was pre-marshalled for the old window, and ${delayH.toFixed(0)} h of receivals have landed on top of it since. The dig is ${digFor(delayH).toLocaleString('en-SG')} moves against a budgeted ${digFor(0).toLocaleString('en-SG')}.` }
          : { title: 'The yard is still to plan', clip: CLIP.yard, detail: `The dig stands at the budgeted ${digFor(0).toLocaleString('en-SG')} moves. Nothing has been buried yet.` },
      },
    },
    commercial: {
      headline: 'Everything you promised on this call is now a conversation.',
      kpis: ['connectionsAtRisk', 'teuAtRisk', 'demurrageExposure', 'gateSlotsForfeited'],
      overlays: ['connectionThreads', 'freeTimeRings', 'pharmaThread'],
      allowed: ['reoffer-'],
      retell: {
        3: { title: 'Customers are already on the road', detail: `${slotsB} hauliers hold appointments for a vessel that is not here. They find out at the gate unless you tell them.` },
        4: { title: 'The calls you have to make', detail: hitB.count ? `${hitB.count} connections, ${hitB.teu.toLocaleString('en-SG')} TEU.` : 'None yet.' },
      },
    },
    group: {
      headline: 'An ordinary late ship, priced.',
      kpis: GROUP_KPIS, overlays: ['rollupFrame'], allowed: [],
      retell: { 0: { title: 'Nothing has gone wrong here', detail: 'A ship is late. What it costs depends entirely on how early you knew.' } },
    },
    engineering: {
      headline: 'Only interesting if you surge the split.',
      kpis: ['assetAvailabilityPct', 'movesPerHour'], overlays: ['healthHalos', 'dutyCycle'],
      allowed: [], retell: {},
    },
  };

  return {
    id: 'vessel-delay', label: 'Vessel arrives late',
    subtitle: 'One ETA revision, and the whole day re-plans itself.',
    plate: 'clear', scale: 'TERMINAL',
    disturbance: {
      label: 'Arrival delay', unit: 'h', min: 0, max: 24, step: 1, value: delayH,
      caption: `ETA slip ${delayH.toFixed(0)} h · berth overrun ${collisionB.toFixed(1)} h · dig ${digFor(delayH).toLocaleString('en-SG')} moves · ${slotsB} appointments lapsed`,
    },
    chain, adaptations,
    comparison: comparison(baseline, adapted, adaptedB, chosen, chosenB, at),
    weather: { windKt: 9, rain: 0, visibility: 1, gustPhase: phase },
    audiences, facet: facetFor(lens, SPECS[lens], FALLBACK),
    thresholds: thresholdsFor('vessel-delay', 0, 24, 1),
    polarity: 'disturbance', optimum: null,
    solve: solved.result,
    /* what the committed plan repairs, so the stage can show it rather than
       assert it: the links it fixes, the cranes it works with, the dig it
       leaves behind */
    fixed: [
      ...(chosen !== null && chosen.startsWith('reberth-') ? [1] : []),
      ...(chosen !== null && chosen.startsWith('premarshal-') ? [2] : []),
      ...(chosen !== null && chosen.startsWith('reoffer-') ? [3] : []),
      ...(chosen !== null && chosen.startsWith('surge-') && Number(chosen.slice(6)) > cranes ? [1, 4] : []),
    ],
    cranes: chosen !== null && chosen.startsWith('surge-') ? Number(chosen.slice(6)) : cranes,
    dig: adapted.yardDigMoves.value,
    preview: null,   // the kernel fills this when a plan is being projected
    insert: 'inserts/vessel.mp4',
  };
}

/* ======================================================= S2 · AGV REROUTE == */
function agvReroute(v: number, lens: LensId, chosen: string | null, chosenB: string | null, at: SimInstant, phase: number): ScenarioState {
  const down = v;
  const cranes = FLEET.cranes, movesRemaining = FLEET.movesRemaining;
  const required = cranes * FLEET.perCrane;
  const poolB = FLEET.size - down;
  const rateB = NOMINAL_RATE * clamp(poolB / required, 0.25, 1);
  const turnNominal = movesRemaining / (NOMINAL_RATE * cranes);
  const delayB = movesRemaining / (rateB * cranes) - turnNominal;
  const hitB = connectionsHit(delayB);
  const waitPct = clamp(1 - poolB / required, 0, 1) * 100;

  const run = (id: string | null) => {
    let pool = poolB, gain = 1, kwhAdj = 0;
    if (id === 'repool') gain = 1.16;
    if (id === 'landside-lane') gain = 1.09;
    if (id === 'stagger-charge') { pool = poolB + 3; kwhAdj = -0.42; }
    const rate = NOMINAL_RATE * clamp((pool * gain) / required, 0.25, 1);
    const delay = Math.max(0, movesRemaining / (rate * cranes) - turnNominal);
    const hit = connectionsHit(delay);
    return kpiSet({
      movesPerHr: rate, cranes, movesRemaining, digMoves: digFor(delay),
      truckTurnMin: 42 + (NOMINAL_RATE - rate) * 1.3,
      slotsLost: Math.round((NOMINAL_RATE - rate) * 8),
      connsAtRisk: hit.count, teuAtRisk: hit.teu,
      kwhPerMove: 3.42 + (NOMINAL_RATE - rate) * 0.034 + kwhAdj,
      demurrage: hit.teu * 154, availability: 94.2 - down * 0.6,
    }, at, 'fleet-v2');
  };

  const baseline = run(null);
  const adapted = chosen ? run(chosen) : baseline;
  const adaptedB = chosenB ? run(chosenB) : null;

  const sev = (a: boolean, w: boolean) => (a ? 'alarm' : w ? 'watch' : 'ok') as PropagationStep['severity'];
  const chain: PropagationStep[] = [
    {
      scale: 'FLEET', clock: 'now', atMs: 30 * SEC, because: '',
      title: 'Fleet availability drops', short: 'Fleet down',
      detail: `${down} of ${FLEET.size} vehicles out — charging, fault or blocked. ${poolB} remain against a requirement of ${required.toFixed(0)}.`,
      fact: fact(poolB, 'none', 0.96, 'fleet-v2', at, ['EV-FLEET-1']),
      from: `${FLEET.size} available`, to: `${poolB} available`,
      clip: CLIP.charging, severity: sev(poolB < required * 0.7, poolB < required), anchor: [0.16, 0.66],
    },
    {
      scale: 'FLEET', clock: '3 min', atMs: 3 * MIN, because: 'so transport cannot keep up',
      title: 'Cranes wait under the hook', short: 'Hook starves',
      detail: 'Every crane cycle that finds no vehicle waiting is dead time on the most expensive asset on the terminal.',
      fact: fact(waitPct, 'pct', 0.89, 'fleet-v2', at, ['EV-FLEET-1']),
      from: '0%', to: `${waitPct.toFixed(0)}% idle`,
      kpi: 'movesPerHour', clip: CLIP.hook, severity: sev(poolB < required * 0.7, poolB < required), anchor: [0.67, 0.60],
    },
    {
      scale: 'TERMINAL', clock: '40 min', atMs: 40 * MIN, because: 'so the quay slows',
      title: 'Gross crane rate falls', short: 'GCR falls',
      detail: `Gang rate ${NOMINAL_RATE} → ${rateB.toFixed(1)} moves per hour. Turnaround stretches by ${delayB.toFixed(1)} h.`,
      fact: fact(rateB, 'movesPerHr', 0.92, 'berth-solver-v2', at, ['EV-PLAN-1']),
      from: `${NOMINAL_RATE} mv/hr`, to: `${rateB.toFixed(1)} mv/hr`,
      kpi: 'movesPerHour', clip: CLIP.agv, severity: sev(rateB < 20, rateB < 28), anchor: [0.38, 0.62],
    },
    {
      scale: 'TERMINAL', clock: '5 h', atMs: 5 * HOUR, because: 'so charging collides with the peak',
      title: 'Charging collides with the peak', short: 'Charge vs peak',
      detail: 'The vehicles that are out need charge back, and the cheapest window has already closed. Energy per move rises with every extra trip.',
      fact: baseline.energyKwhPerMove,
      from: '3.42 kWh', to: `${baseline.energyKwhPerMove.value.toFixed(2)} kWh`,
      kpi: 'energyKwhPerMove', clip: CLIP.charging, severity: sev(down > 8, down > 4), anchor: [0.16, 0.72],
    },
    {
      scale: 'PORT', clock: '2 d', atMs: 2 * DAY, because: 'so a connection misses',
      title: hitB.count ? 'Cargo rolls to the next sailing' : 'Every connection is made',
      short: hitB.count ? 'Cargo rolled' : 'Connections made',
      detail: hitB.count
        ? `${hitB.count} connection${hitB.count > 1 ? 's' : ''} at risk — ${hitB.teu.toLocaleString('en-SG')} TEU.`
        : 'The delay stays inside the slack. Nothing downstream moves.',
      fact: fact(hitB.teu, 'TEU', 0.75, 'flow-v4.2', at, ['EV-CONN-1']),
      from: '0 TEU', to: `${hitB.teu.toLocaleString('en-SG')} TEU`,
      kpi: 'teuAtRisk', clip: CLIP.feeder, severity: sev(hitB.count >= 2, hitB.count >= 1), anchor: [0.26, 0.80],
    },
  ];

  const adaptations: Adaptation[] = [
    {
      id: 'repool', label: 'Re-pool the fleet across fewer cranes',
      rationale: 'Stop spreading the shortage evenly. Concentrate the vehicles on four cranes running full rather than seven running starved — total throughput is higher.',
      costs: [fact(3, 'none', 0.9, 'fleet-v2', at, [])],
      saves: [fact(Math.max(0, NOMINAL_RATE * clamp(poolB * 1.16 / required, 0.25, 1) - rateB), 'movesPerHr', 0.89, 'fleet-v2', at, [])],
      band: band(0.9, 0.18, 0.95), recommended: down >= 3 && down < 9,
    },
    {
      id: 'landside-lane', label: 'Route via the landside lane',
      rationale: 'Longer distance, but it bypasses the congested seaward route and the block-face queue. Pays off once the seaward lane is saturated.',
      costs: [fact(0.4, 'kWh', 0.86, 'energy-v1', at, [])],
      saves: [fact(Math.max(0, NOMINAL_RATE * clamp(poolB * 1.09 / required, 0.25, 1) - rateB), 'movesPerHr', 0.85, 'fleet-v2', at, [])],
      band: band(0.87, 0.2, 0.95), recommended: down >= 2 && down < 5,
    },
    {
      id: 'stagger-charge', label: 'Stagger charging out of the peak window',
      rationale: 'Pull three vehicles back into service now and push their charge into the 22:00 trough. Buys fleet at the cost of a tighter battery margin later.',
      costs: [fact(0.2, 'none', 0.82, 'energy-v1', at, [])],
      saves: [fact(3, 'none', 0.88, 'fleet-v2', at, [])],
      band: band(0.84, 0.26, 0.8), recommended: down >= 9,
    },
  ];

  const audiences: AudienceSignal[] = [
    sig('operations', rateB < 28 ? 3 : 1, rateB < 28
      ? `Gang rate ${rateB.toFixed(1)}. Cranes are idling ${waitPct.toFixed(0)}% of cycles waiting for a vehicle.`
      : 'Transport is keeping up. Quay is nominal.'),
    sig('energy', down >= 6 ? 3 : down >= 3 ? 2 : 0, down >= 6
      ? 'Recovery charging now lands squarely in the evening peak. Every kWh is at peak tariff.'
      : down >= 3 ? 'Charging schedule is tightening against the peak window.' : 'Draw profile nominal.'),
    sig('engineering', down >= 5 ? 2 : 1, down >= 5
      ? 'The remaining vehicles absorb the whole duty. Battery cycles and drive wear accrue faster on a smaller pool.'
      : 'Normal duty across the fleet.'),
    sig('otsec', down >= 8 ? 2 : 0, down >= 8
      ? 'A simultaneous loss on this scale usually means a network segment, not eight independent faults. Worth ruling out.'
      : 'Nothing anomalous in the fleet control segment.'),
    sig('commercial', hitB.count ? 2 : 0, hitB.count
      ? `${hitB.teu.toLocaleString('en-SG')} TEU now at risk downstream.` : 'Nothing downstream has moved.'),
    sig('safety', down >= 9 ? 1 : 0, down >= 9
      ? 'Manual tractors are being brought onto the automated apron. Mixed traffic changes the exposure.'
      : 'No mixed traffic. Apron remains fully automated.'),
    sig('projects', 0, 'Nothing outstanding on the fleet programme.'),
    sig('group', hitB.count ? 2 : 1, `Throughput ${rateB.toFixed(1)} mv/hr, energy ${baseline.energyKwhPerMove.value.toFixed(2)} kWh per move.`),
  ];

  const FALLBACK: FacetSpec = {
    headline: 'This one sits with operations and energy.',
    kpis: ['movesPerHour', 'energyKwhPerMove', 'vesselTurnaroundH'], overlays: [], allowed: [],
  };
  const SPECS: Partial<Record<LensId, FacetSpec>> = {
    operations: {
      headline: 'Horizontal transport is the constraint, not the quay.',
      kpis: ['movesPerHour', 'vesselTurnaroundH', 'truckTurnTimeMin'],
      overlays: ['agvFlow', 'exceptionPins', 'berthWindows'],
      allowed: ['repool', 'landside-lane'],
      retell: {
        1: { title: 'Your cranes are waiting', detail: `${waitPct.toFixed(0)}% of crane cycles find no vehicle under the hook. That is the most expensive idle time on the terminal.` },
      },
    },
    energy: {
      headline: 'The shortage becomes a tariff problem by this evening.',
      kpis: ['energyKwhPerMove', 'co2gPerMove', 'movesPerHour'],
      overlays: ['carbonRibbon', 'microgrid', 'shorePower'],
      allowed: ['stagger-charge'],
      retell: {
        3: { title: 'Recovery charge lands in the peak', detail: `${down} vehicles all need charge back, and the cheap window has closed. This is where the money goes.` },
      },
    },
    otsec: {
      headline: down >= 8 ? 'Eight simultaneous faults is not eight faults.' : 'Quiet — for now.',
      kpis: ['assetAvailabilityPct', 'movesPerHour'],
      overlays: ['otSegments', 'dependencyEdges', 'blastRadius'], allowed: [],
      retell: {
        0: { title: 'Check the segment before the vehicles', detail: 'A correlated loss across a fleet usually shares a control-network path. The dependency graph will say in seconds.' },
      },
    },
    engineering: {
      headline: 'A smaller pool takes the same duty.',
      kpis: ['assetAvailabilityPct', 'energyKwhPerMove', 'movesPerHour'],
      overlays: ['healthHalos', 'dutyCycle'], allowed: [], retell: {},
    },
    group: { headline: 'Throughput and cost per move, both moving the wrong way.', kpis: GROUP_KPIS, overlays: ['rollupFrame'], allowed: [], retell: {} },
  };

  return {
    id: 'agv-reroute', label: 'Reroute the AGV fleet',
    subtitle: 'Horizontal transport is the quiet constraint on every quay.',
    plate: 'clear', scale: 'FLEET',
    disturbance: {
      label: 'Vehicles unavailable', unit: 'none', min: 0, max: 12, step: 1, value: down,
      caption: `${poolB} of ${FLEET.size} available · requirement ${required.toFixed(0)} · gang rate ${rateB.toFixed(1)} mv/hr`,
    },
    chain, adaptations,
    comparison: comparison(baseline, adapted, adaptedB, chosen, chosenB, at),
    weather: { windKt: 12, rain: 0, visibility: 1, gustPhase: phase },
    audiences, facet: facetFor(lens, SPECS[lens], FALLBACK),
    thresholds: thresholdsFor('agv-reroute', 0, 12, 1),
    polarity: 'disturbance', optimum: null,
    solve: solveCurated(lens, baseline, run, [
      { agent: 'fleet', ids: [
        { id: 'repool', label: 'Re-pool the fleet across fewer cranes' },
        { id: 'landside-lane', label: 'Route via the landside lane' },
        { id: 'stagger-charge', label: 'Stagger charging out of the peak window' },
      ] },
    ], [
      ['repool', 'landside-lane', 'the pool is already concentrated on four cranes — the landside lane would route vehicles away from the cranes that need them'],
    ]).result,
    fixed: chosen === 'repool' ? [1, 2] : chosen === 'stagger-charge' ? [3] : chosen === 'landside-lane' ? [2] : [],
    cranes: chosen === 'repool' ? 4 : FLEET.cranes,
    dig: adapted.yardDigMoves.value,
    preview: null,   // the kernel fills this when a plan is being projected
    insert: 'inserts/agv.mp4',
  };
}

/* ---------------------------------------------------------------- export -- */

export const SCENARIO_IDS: ScenarioId[] = ['vessel-delay', 'jit-arrival', 'agv-reroute', 'monsoon-sway'];
export const DEFAULT_DISTURBANCE: Record<ScenarioId, number> = {
  'monsoon-sway': 45, 'vessel-delay': 14, 'agv-reroute': 6, 'jit-arrival': 34,
};


/* =============================================== S12 · JUST-IN-TIME ARRIVAL ==
 *
 * The only scenario in the set where nothing has gone wrong.
 *
 * The terminal knows something the carrier does not: the berth will not be free
 * for BERTH_GAP hours after the vessel would otherwise arrive. Today that stays
 * inside the terminal, so the vessel steams at service speed, arrives, and waits
 * at anchorage burning fuel for nothing. Publish the window early enough and the
 * vessel spends those hours slow steaming instead.
 *
 * The control is therefore a DECISION — how many hours ahead you commit — and
 * the interesting result is that more is not better. Fuel burn goes as the cube
 * of speed, so a gentle slowdown over a long distance saves more than a sharp
 * one over a short distance; but a window committed further out is a window more
 * likely to be broken, and a broken commitment costs a re-offer and a re-plan.
 * The two curves cross. The console's job is to find where.
 */
const JIT = {
  leg: 1450,          // nm still to run on the last leg
  v0: 18,             // kt service speed
  vMin: 12,           // kt floor — charter terms and safe steerage
  gap: 8.4,           // h the berth is not free for
  burn0: 8.75,        // t/h main engine at v0  (210 t/day)
  co2PerT: 3.11,      // t CO2 per t of VLSFO
  sgdPerT: 810,       // S$ per t bunkers
  breachSgd: 42_000,  // S$ cost of a committed window that has to be broken
  callsPerYear: 1150, // for the group-level extrapolation
  adoption: 0.40,
} as const;
const JIT_K = JIT.burn0 / (JIT.v0 ** 3);

/** How far the vessel still has to run when the window reaches it. */
const jitDistance = (h: number) => Math.min(JIT.leg, JIT.v0 * h);

/** The speed that turns the whole berth gap into steaming time — if it can. */
function jitSpeed(h: number): number {
  const d = jitDistance(h);
  if (d <= 0) return JIT.v0;
  return Math.max(JIT.vMin, (JIT.v0 * d) / (d + JIT.v0 * JIT.gap));
}
/** Fuel over a leg goes as v²·d, so this is the whole saving in one line. */
function jitFuelSaved(h: number): number {
  const d = jitDistance(h), v = jitSpeed(h);
  return JIT_K * d * (JIT.v0 ** 2 - v ** 2);
}
/** Hours of anchorage wait the slowdown actually absorbs. Capped by the gap. */
function jitAbsorbed(h: number): number {
  const d = jitDistance(h), v = jitSpeed(h);
  return d <= 0 ? 0 : Math.min(JIT.gap, d / v - d / JIT.v0);
}
/** Schedule reliability: the further out you commit, the less it is worth. */
const jitHold = (h: number) => Math.max(0.45, 0.97 - 0.0045 * h);
/** Commercial's currency: fuel earned, weighted by the chance the window holds. */
const jitNetSgd = (h: number) =>
  jitFuelSaved(h) * JIT.sgdPerT * jitHold(h) - JIT.breachSgd * (1 - jitHold(h));

/**
 * What each audience is actually buying. Unlocks are the notice hours at which
 * a capability switches on for that audience; riskBlind means the audience does
 * not price the chance of the window breaking — which is exactly why Energy and
 * Commercial disagree by 38 hours.
 */
const JIT_VALUE: Partial<Record<LensId, {
  unlocks: readonly (readonly [number, number])[]; fuelW: number; breachW: number; riskBlind?: boolean;
}>> = {
  operations: { unlocks: [[18, 0.6], [24, 0.6]], fuelW: 0, breachW: 0.35 },
  engineering: { unlocks: [[24, 1.0]], fuelW: 0, breachW: 0.20 },
  safety: { unlocks: [[18, 0.4], [30, 0.7]], fuelW: 0, breachW: 0.25 },
  group: { unlocks: [[18, 0.5], [40, 0.8]], fuelW: 0.30, breachW: 0.40 },
  projects: { unlocks: [[48, 1.0]], fuelW: 0.20, breachW: 0.15 },
  energy: { unlocks: [], fuelW: 1, breachW: 0, riskBlind: true },
};
const JIT_MAX_FUEL = jitFuelSaved(72);

function jitValue(lens: LensId, h: number): number | null {
  if (lens === 'commercial') return jitNetSgd(h);
  const spec = JIT_VALUE[lens];
  if (!spec) return null;                       // OT security. Honestly nothing.
  const unlocked = spec.unlocks.reduce((sum, [at, w]) => sum + (h >= at ? w : 0), 0);
  const base = unlocked + spec.fuelW * (jitFuelSaved(h) / JIT_MAX_FUEL);
  return base * (spec.riskBlind === true ? 1 : jitHold(h)) - spec.breachW * (1 - jitHold(h));
}

/** Scan the same model the outcome comes from. The star can never lie. */
function jitOptimum(lens: LensId, max: number): number | null {
  if (jitValue(lens, 0) === null) return null;
  let best = 0, bestV = -Infinity;
  for (let h = 0; h <= max; h += 1) {
    const v = jitValue(lens, h) ?? -Infinity;
    if (v > bestV) { bestV = v; best = h; }
  }
  return best;
}

function jitArrival(v: number, lens: LensId, chosen: string | null, chosenB: string | null, at: SimInstant, phase: number): ScenarioState {
  const notice = v;
  const speed = jitSpeed(notice);
  const fuelT = jitFuelSaved(notice);
  const co2T = fuelT * JIT.co2PerT;
  const absorbed = jitAbsorbed(notice);
  const waitLeft = JIT.gap - absorbed;
  const hold = jitHold(notice);
  const splitLocks = notice >= 24;
  const lullUsable = notice >= 30;
  const gateFirm = notice >= 44;
  const cranes = VESSEL.cranesDefault, movesRemaining = VESSEL.movesRemaining;

  /** gain is the fraction of the modelled upside a given policy actually takes */
  const run = (id: string | null) => {
    const gain = id === 'firm-window' ? 1 : id === 'indicative-window' ? 0.72 : 0;
    const rate = NOMINAL_RATE - 1 + (splitLocks ? 3 * gain : 0);   // 31 churning, 34 locked
    return kpiSet({
      movesPerHr: rate, cranes, movesRemaining,
      digMoves: digFor(UNPLANNED_STALENESS) - (lullUsable ? digRecoverable(UNPLANNED_STALENESS) * gain : 0),
      truckTurnMin: 51.7 - (gateFirm ? 13.5 * gain : 0),
      slotsLost: 0, connsAtRisk: 0, teuAtRisk: 0,
      kwhPerMove: 3.42 - (splitLocks ? 0.14 * gain : 0),
      demurrage: 0, availability: 94.2 + (splitLocks ? 0.4 * gain : 0),
      anchorageH: JIT.gap - absorbed * gain,
      fuelSavedT: fuelT * gain,
    }, at, 'voyage-v1');
  };

  const baseline = run(null);
  const adapted = chosen ? run(chosen) : baseline;
  const adaptedB = chosenB ? run(chosenB) : null;
  const gainOf = (id: string | null) => (id === 'firm-window' ? 1 : id === 'indicative-window' ? 0.72 : 0);
  const fuelSgd = fuelT * JIT.sgdPerT * gainOf(chosen)
    - (chosen === 'firm-window' ? JIT.breachSgd * (1 - hold) : 0);

  /* Everything here is a gain, so every step is 'ok'. The console reads the
     polarity and inverts its own sign language rather than being told twice. */
  const step = (x: Omit<PropagationStep, 'severity'>): PropagationStep => ({ ...x, severity: 'ok' });
  const chain: PropagationStep[] = [
    step({
      scale: 'PORT', clock: 'now', atMs: 60 * SEC, because: '',
      title: 'Berth availability published', short: 'Window out',
      detail: `T2 publishes a berth window ${notice.toFixed(0)} h ahead of arrival. Nothing has gone wrong — this is a number the terminal already held, released earlier.`,
      fact: fact(notice, 'h', 0.95, 'berth-solver-v2', at, ['EV-WIN-1']),
      from: 'held internally', to: `shared ${notice.toFixed(0)} h out`,
      clip: CLIP.planroom, anchor: [0.48, 0.60],
    }),
    step({
      scale: 'PORT', clock: '4 min', atMs: 4 * MIN, because: 'so the carrier can re-plan the leg',
      title: 'Carrier trims the passage speed', short: 'Slow steam',
      detail: `Oracoast Line re-plans the last ${jitDistance(notice).toFixed(0)} nm at ${speed.toFixed(1)} kt instead of ${JIT.v0} kt. Burn goes as the cube of speed, which is where the whole saving comes from.`,
      fact: fact(speed, 'none', 0.79, 'voyage-v1', at, ['EV-AIS-2']),
      from: `${JIT.v0.toFixed(1)} kt`, to: `${speed.toFixed(1)} kt`,
      clip: CLIP.economical, anchor: [0.72, 0.50],
    }),
    step({
      scale: 'TERMINAL', clock: '25 min', atMs: 25 * MIN, because: splitLocks ? 'so the split can be committed now, not on arrival' : 'but the split cannot be committed yet',
      title: splitLocks ? 'The crane split holds' : 'The split is still provisional',
      short: splitLocks ? 'Split holds' : 'Split soft',
      detail: splitLocks
        ? 'Four cranes are committed against a known arrival. Two re-plans that would have happened do not, and the gang rate holds at 34 instead of drifting to 31.'
        : `At ${notice.toFixed(0)} h of notice the planner will not commit the split — the arrival is still a guess, so the gang works to a provisional plan.`,
      fact: fact(splitLocks ? 34 : 31, 'movesPerHr', 0.93, 'berth-solver-v2', at, ['EV-PLAN-2']),
      from: '31 mv/hr', to: splitLocks ? '34 mv/hr' : '31 mv/hr',
      kpi: 'movesPerHour', clip: CLIP.ontime, anchor: [0.52, 0.60],
    }),
    step({
      scale: 'TERMINAL', clock: '3 h', atMs: 3 * HOUR, because: lullUsable ? 'so the lull becomes usable' : 'but the lull has already passed',
      title: lullUsable ? 'Pre-marshalling runs in the 18:00 lull' : 'No lull left to pre-marshal in',
      short: lullUsable ? 'Pre-marshalled' : 'No lull',
      detail: lullUsable
        ? `Block 3C is pre-marshalled against a window that will hold, while the ASCs sit at 26% utilisation. ${digRecoverable(UNPLANNED_STALENESS).toLocaleString('en-SG')} unproductive moves that would have been paid for at the worst possible moment are paid for at the cheapest one.`
        : 'The window arrived after the overnight lull, so the parcel gets dug out during the peak instead.',
      fact: fact(lullUsable ? digRecoverable(UNPLANNED_STALENESS) : 0, 'moves', 0.88, 'stack-v3', at, ['EV-STACK-2']),
      from: `${digFor(UNPLANNED_STALENESS).toLocaleString('en-SG')} moves`,
      to: `${(lullUsable ? digFor(0) : digFor(UNPLANNED_STALENESS)).toLocaleString('en-SG')} moves`,
      kpi: 'yardDigMoves', clip: CLIP.dig, anchor: [0.36, 0.83],
    }),
    step({
      scale: 'FLEET', clock: '8 h', atMs: 8 * HOUR, because: gateFirm ? 'so appointments can be issued against it' : 'but the gate book cannot be firmed yet',
      title: gateFirm ? 'Appointments issued against a firm window' : 'The gate book stays provisional',
      short: gateFirm ? 'Gate firm' : 'Gate soft',
      detail: gateFirm
        ? 'Hauliers book against a window that will actually happen. Truck turn time falls from 51.7 to 38.2 minutes, and the queue on the landside road never forms.'
        : 'Hauliers book against an estimate, so the gate keeps its usual buffer and its usual queue.',
      fact: fact(gateFirm ? 38.2 : 51.7, 'min', 0.88, 'gate-v2', at, ['EV-GATE-2']),
      from: '51.7 min', to: gateFirm ? '38.2 min' : '51.7 min',
      kpi: 'truckTurnTimeMin', clip: CLIP.gate, anchor: [0.80, 0.70],
    }),
    step({
      scale: 'PORT', clock: `${notice.toFixed(0)} h`, atMs: Math.max(6 * HOUR, notice * HOUR), because: 'and when the ship does arrive',
      title: waitLeft < 0.1 ? 'The anchorage stays empty' : 'Most of the wait disappears',
      short: waitLeft < 0.1 ? 'No wait' : 'Wait cut',
      detail: waitLeft < 0.1
        ? `The vessel arrives inside its window. ${JIT.gap.toFixed(1)} h of anchorage waiting simply does not happen, and ${fuelT.toFixed(0)} t of bunkers are not burned.`
        : `${absorbed.toFixed(1)} h of the ${JIT.gap.toFixed(1)} h wait is absorbed. ${waitLeft.toFixed(1)} h of anchorage remains — the notice came too late to convert all of it.`,
      fact: fact(fuelT, 't', 0.71, 'voyage-v1', at, ['EV-FUEL-1']),
      from: `${JIT.gap.toFixed(1)} h at anchor`, to: `${waitLeft.toFixed(1)} h at anchor`,
      kpi: 'anchorageWaitH', clip: CLIP.anchorage, anchor: [0.62, 0.575],
    }),
    step({
      scale: 'PORT', clock: '2 d', atMs: 2 * DAY, because: 'so the connections inherit the certainty',
      title: 'Connections gain slack instead of losing it', short: 'Slack gained',
      detail: `The four onward services do not have to hold a buffer against this call. 3,150 TEU gain ${(4.5 * hold).toFixed(1)} h of slack — the same arithmetic that loses it when a vessel is late, run in the other direction.`,
      fact: fact(3150, 'TEU', 0.75, 'flow-v4.2', at, ['EV-CONN-2']),
      from: '0 h slack', to: `+${(4.5 * hold).toFixed(1)} h`,
      clip: CLIP.feeder, anchor: [0.29, 0.79],
    }),
    step({
      scale: 'PORT', clock: '1 wk', atMs: 7 * DAY, because: 'so the berth stops being a queue',
      title: 'The berth becomes a schedule slot', short: 'A slot, not a queue',
      detail: `Repeat this across the week and the same quay absorbs roughly one more call, on the same steel. At ${JIT.callsPerYear} calls a year and ${(JIT.adoption * 100).toFixed(0)}% adoption this is about S$${((jitNetSgd(notice) * JIT.callsPerYear * JIT.adoption) / 1e6).toFixed(1)}m and ${((co2T * JIT.callsPerYear * JIT.adoption) / 1000).toFixed(0)}k tonnes of CO₂ a year. Synthetic figures.`,
      fact: fact(co2T, 't', 0.7, 'energy-v1', at, ['EV-CO2-1']),
      from: '0 t CO₂', to: `${co2T.toFixed(0)} t CO₂ saved`,
      kpi: 'co2gPerMove', clip: CLIP.berth, anchor: [0.21, 0.63],
    }),
  ];

  const adaptations: Adaptation[] = [
    {
      id: 'firm-window', label: 'Publish a firm berth window',
      rationale: `Commit the window and hold it. The carrier commits to the arrival in return. Full value — but the berth is locked, so a later, larger call cannot be slotted in, and a window you break costs S$${(JIT.breachSgd / 1000).toFixed(0)}k.`,
      costs: [fact(JIT.breachSgd * (1 - hold), 'SGD', 0.7, 'voyage-v1', at, [])],
      saves: [fact(fuelT, 't', 0.71, 'voyage-v1', at, [])],
      band: band(0.79, 0.68, 0.45), recommended: notice >= 18 && notice <= 46,
    },
    {
      id: 'indicative-window', label: 'Publish indicative, with automatic re-offer',
      rationale: 'A ±90 minute tolerance band and an automatic re-price if the window moves. About 72% of the value, and every re-sequencing option stays open.',
      costs: [fact(0, 'SGD', 0.85, 'voyage-v1', at, [])],
      saves: [fact(fuelT * 0.72, 't', 0.74, 'voyage-v1', at, [])],
      band: band(0.85, 0.3, 0.9), recommended: notice > 46 || (notice > 0 && notice < 18),
    },
    {
      id: 'swap-market', label: 'Open the window to a swap market',
      rationale: 'Publish, and let carriers trade windows between themselves under terminal rules. The terminal stops allocating berth time and starts making a market in it. Not modelled — shown because it is where this road leads.',
      costs: [fact(0, 'SGD', 0.4, 'voyage-v1', at, [])],
      saves: [fact(0, 't', 0.4, 'voyage-v1', at, [])],
      band: 'ADVISE', recommended: false,
    },
  ];

  const opt = (l: LensId) => jitOptimum(l, 72);
  const mine = opt(lens);
  const energyOpt = opt('energy') ?? 72, commercialOpt = opt('commercial') ?? 34;

  const audiences: AudienceSignal[] = [
    sig('group', notice >= 40 ? 3 : notice >= 18 ? 2 : 1,
      `The berth stops being a queue. Across the year, about S$${((jitNetSgd(notice) * JIT.callsPerYear * JIT.adoption) / 1e6).toFixed(1)}m on a scheduling discipline, not a capital programme.`),
    sig('energy', fuelT > 80 ? 3 : fuelT > 30 ? 2 : fuelT > 0 ? 1 : 0,
      `${fuelT.toFixed(0)} t of bunkers and ${co2T.toFixed(0)} t of CO₂ not burned on one call. Energy would run this at ${energyOpt} h — it does not price the commitment.`),
    sig('commercial', notice >= 18 ? 3 : notice > 0 ? 2 : 0,
      `Fuel alone nets S$${Math.round(jitNetSgd(notice)).toLocaleString('en-SG')} a call at ${notice.toFixed(0)} h, before the terminal-side gains. Commercial stops at ${commercialOpt} h, because past there a broken window costs more than the extra fuel is worth.`),
    sig('operations', splitLocks ? 3 : notice >= 18 ? 2 : 1, splitLocks
      ? 'The split is committed and the gang rate holds at 34. Two re-plans do not happen.'
      : 'Still planning against an estimate. Nothing to commit yet.'),
    sig('safety', notice >= 30 ? 2 : 0, notice >= 30
      ? 'The work moves out of the rushed night re-sequence and into planned hours. Fewer of the hours where things go wrong.'
      : 'No change to exposure.'),
    sig('engineering', splitLocks ? 2 : 0, splitLocks
      ? 'Steady duty instead of surge-and-idle. Fatigue accrues to the plan rather than ahead of it.'
      : 'No change to duty cycle.'),
    sig('projects', notice >= 48 ? 2 : 0, notice >= 48
      ? 'This is the berth-window product, proved on live calls before any capital is committed to it.'
      : 'Nothing to prove at this notice horizon.'),
    sig('otsec', 0, 'Nothing. No control network is touched — and a demo where every lens lights up is a demo nobody believes.'),
  ];

  const FALLBACK: FacetSpec = {
    headline: 'Nothing is wrong. The question is what knowing early is worth.',
    kpis: ['fuelTonnesSaved', 'anchorageWaitH', 'vesselTurnaroundH'], overlays: [], allowed: [],
  };
  const SPECS: Partial<Record<LensId, FacetSpec>> = {
    group: {
      headline: `Shared context is the asset. No crane is bought.`,
      kpis: ['fuelTonnesSaved', 'anchorageWaitH', 'co2gPerMove', 'vesselTurnaroundH', 'truckTurnTimeMin', 'yardDigMoves'],
      overlays: ['rollupFrame', 'connectionThreads'], allowed: ['firm-window', 'indicative-window'],
      retell: {
        0: { title: 'One number, released earlier', detail: 'Nothing is built. A berth window the terminal already held is shared before the vessel commits to a speed.' },
        7: { title: 'A slot, not a queue', detail: 'Do it every call and the quay carries more without growing.' },
      },
    },
    energy: {
      headline: `${fuelT.toFixed(0)} t of fuel and ${co2T.toFixed(0)} t of CO₂ on a single call.`,
      kpis: ['fuelTonnesSaved', 'co2gPerMove', 'energyKwhPerMove', 'anchorageWaitH'],
      overlays: ['carbonRibbon', 'shorePower'], allowed: ['indicative-window'],
      retell: {
        1: { title: 'Burn falls as the cube of speed', clip: CLIP.economical, detail: `${JIT.v0} kt to ${speed.toFixed(1)} kt over ${jitDistance(notice).toFixed(0)} nm. Nothing else in this console moves a number this far.` },
      },
    },
    commercial: {
      headline: `Fuel alone nets S$${Math.round(jitNetSgd(notice)).toLocaleString('en-SG')} a call — and there is a reason not to commit further out.`,
      kpis: ['fuelTonnesSaved', 'demurrageExposure', 'truckTurnTimeMin', 'anchorageWaitH'],
      overlays: ['connectionThreads', 'freeTimeRings'], allowed: ['firm-window', 'indicative-window', 'swap-market'],
      retell: {
        0: { title: 'You are selling certainty', detail: `A committed window holds ${(hold * 100).toFixed(0)}% of the time at this notice. That number is the product.` },
      },
    },
    operations: {
      headline: splitLocks ? 'The plan you commit is the plan you work.' : 'Too early to commit anything.',
      kpis: ['movesPerHour', 'yardDigMoves', 'truckTurnTimeMin', 'anchorageWaitH'],
      overlays: ['berthWindows', 'digHeat'], allowed: ['firm-window'],
      retell: {
        2: { title: splitLocks ? 'Two re-plans that never happen' : 'Still working to a guess', clip: CLIP.ontime, detail: splitLocks ? 'The gang rate difference between a committed plan and a provisional one is three moves an hour, every hour.' : 'The planner holds the split back until the arrival is real.' },
      },
    },
    safety: {
      headline: 'The safest hour is the one you did not have to rush.',
      kpis: ['anchorageWaitH', 'assetAvailabilityPct', 'movesPerHour'],
      overlays: ['exclusionZones'], allowed: [], retell: {},
    },
    engineering: {
      headline: 'Steady duty beats surge-and-idle, on every bearing in the fleet.',
      kpis: ['assetAvailabilityPct', 'movesPerHour', 'energyKwhPerMove'],
      overlays: ['dutyCycle', 'healthHalos'], allowed: [], retell: {},
    },
    otsec: {
      headline: 'Nothing here touches the control network. That is the honest answer.',
      kpis: ['anchorageWaitH', 'fuelTonnesSaved'], overlays: [], allowed: [], retell: {},
    },
    projects: {
      headline: 'A product you can prove on live calls before you fund it.',
      kpis: ['fuelTonnesSaved', 'truckTurnTimeMin', 'vesselTurnaroundH'],
      overlays: ['commissioningState'], allowed: ['indicative-window'], retell: {},
    },
  };

  const LENS_SHORT: Record<LensId, string> = LENS_LABEL;
  const others = (['operations', 'engineering', 'safety', 'commercial', 'energy', 'group', 'projects'] as LensId[])
    .filter(l => l !== lens)
    .map(l => ({ lens: l, value: opt(l) ?? 0 }))
    .filter(x => x.value > 0);

  return {
    id: 'jit-arrival', label: 'Arrive just in time',
    subtitle: 'Nothing is wrong. The question is what knowing first is worth.',
    plate: 'clear', scale: 'PORT',
    disturbance: {
      label: 'Notice horizon', unit: 'h', min: 0, max: 72, step: 1, value: notice,
      caption: `${notice.toFixed(0)} h of notice · ${speed.toFixed(1)} kt · ${fuelT.toFixed(0)} t fuel · ${waitLeft.toFixed(1)} h still at anchor · window holds ${(hold * 100).toFixed(0)}%`,
    },
    chain, adaptations,
    comparison: comparison(baseline, adapted, adaptedB, chosen, chosenB, at, fuelSgd),
    weather: { windKt: 9, rain: 0, visibility: 1, gustPhase: phase },
    audiences, facet: facetFor(lens, SPECS[lens], FALLBACK),
    thresholds: jitThresholds(),
    insert: 'inserts/economical.mp4',
    solve: solveCurated(lens, baseline, run, [
      { agent: 'voyage', ids: [
        { id: 'firm-window', label: 'Publish a firm berth window' },
        { id: 'indicative-window', label: 'Publish indicative, with automatic re-offer' },
      ] },
      { agent: 'yard', ids: [] },
    ], [
      ['firm-window', 'indicative-window', 'a window is either committed or it is not — publishing both to the same carrier is not a plan'],
    ]).result,
    fixed: chosen !== null ? [2, 3, 4, 5, 6, 7] : [],
    cranes: VESSEL.cranesDefault,
    dig: adapted.yardDigMoves.value,
    preview: null,   // the kernel fills this when a plan is being projected
    polarity: 'improvement',
    optimum: mine === null ? null : {
      value: mine,
      /* At the end of the horizon the honest reading is not "stops" — it is
         that this audience never runs out of reasons to share earlier. */
      label: mine >= 72
        ? `${LENS_SHORT[lens]} would run this to 72 h`
        : `${LENS_SHORT[lens]} stops at ${mine} h`,
      others,
    },
  };
}

/** The gains, and the one place a gain stops paying for itself. */
function jitThresholds(): Threshold[] {
  const out: Threshold[] = [];
  const push = (value: number, label: string, severity: Threshold['severity']) =>
    out.push({ value, label, severity });
  push(6, 'carrier can trim speed at all', 'gain');
  push(18, 'the whole anchorage wait disappears', 'gain');
  push(24, 'the crane split can be committed', 'gain');
  push(30, 'the overnight lull becomes usable', 'gain');
  push(44, 'the gate book can be firmed', 'gain');
  // where the expected cost of breaking the window overtakes the extra fuel
  let prev = jitNetSgd(0);
  for (let h = 1; h <= 72; h += 1) {
    const n = jitNetSgd(h);
    if (n < prev) { push(h, 'commitment risk starts eating the gain', 'watch'); break; }
    prev = n;
  }
  return out.sort((a, b) => a.value - b.value);
}

export function buildScenario(
  id: ScenarioId, value: number, lens: LensId,
  chosen: string | null, chosenB: string | null, at: SimInstant, phase: number,
): ScenarioState {
  if (id === 'jit-arrival') return jitArrival(value, lens, chosen, chosenB, at, phase);
  if (id === 'vessel-delay') return vesselDelay(value, lens, chosen, chosenB, at, phase);
  if (id === 'agv-reroute') return agvReroute(value, lens, chosen, chosenB, at, phase);
  return monsoon(value, lens, chosen, chosenB, at, phase);
}
