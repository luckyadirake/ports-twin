/**
 * THE AGENTS.
 *
 * Each agent owns one model that the kernel already runs, enumerates its own
 * action space, and scores every candidate by pushing it through that model.
 * Nothing here invents a number: a plan's cost is the model's answer to that
 * plan, which is why the recommendation can never contradict the diagnosis
 * sitting three panels to the left.
 *
 * The arbiter does the part a curated list can never do — it finds the plans
 * that cannot both happen and says so.
 */
import type { AgentId, AgentRun, Rejection, SolveResult, LensId, KpiSet } from '../index';

export interface Candidate {
  readonly id: string;
  readonly label: string;
  /** the action, as the scenario's own run() understands it */
  readonly apply: string | null;
  readonly kpis: KpiSet;
  score: number;
}

/**
 * What each audience is actually buying. The ranking is not "best" in the
 * abstract — it is best for the lens that is asking, which is why switching
 * lens can reorder the options.
 */
const WEIGHTS: Record<LensId, Partial<Record<keyof KpiSet, number>>> = {
  /* a duty manager is not indifferent to rolled cargo — leaving connections out
     of operations' currency was why every plan it liked was "more cranes" */
  operations: {
    vesselTurnaroundH: 1.0, movesPerHour: 0.8, yardDigMoves: 0.6,
    truckTurnTimeMin: 0.3, connectionsAtRisk: 0.5, teuAtRisk: 0.4,
  },
  commercial: { teuAtRisk: 1.0, connectionsAtRisk: 0.7, gateSlotsForfeited: 0.6, demurrageExposure: 0.8 },
  engineering: { assetAvailabilityPct: 1.0, movesPerHour: 0.4, energyKwhPerMove: 0.3 },
  safety: { assetAvailabilityPct: 0.7, vesselTurnaroundH: 0.4 },
  energy: { energyKwhPerMove: 1.0, co2gPerMove: 0.8, fuelTonnesSaved: 0.9 },
  otsec: { assetAvailabilityPct: 0.5 },
  projects: { vesselTurnaroundH: 0.5, yardDigMoves: 0.5, assetAvailabilityPct: 0.4 },
  group: {
    vesselTurnaroundH: 0.7, teuAtRisk: 0.9, truckTurnTimeMin: 0.4,
    yardDigMoves: 0.4, co2gPerMove: 0.3, demurrageExposure: 0.6,
  },
};

/** true when a smaller number is a better outcome */
const LOWER_BETTER: Partial<Record<keyof KpiSet, boolean>> = {
  vesselTurnaroundH: true, yardDigMoves: true, truckTurnTimeMin: true,
  gateSlotsForfeited: true, connectionsAtRisk: true, teuAtRisk: true,
  energyKwhPerMove: true, co2gPerMove: true, demurrageExposure: true,
  anchorageWaitH: true, movesPerHour: false, assetAvailabilityPct: false,
  fuelTonnesSaved: false, yardRehandleRate: true,
};

/**
 * Score a candidate against doing nothing, in one lens's currency. Normalised
 * by the baseline so a 3% turnaround gain and a 3% TEU gain are comparable.
 */
export function scoreFor(lens: LensId, baseline: KpiSet, cand: KpiSet): number {
  const w = WEIGHTS[lens];
  let total = 0;
  for (const key of Object.keys(w) as (keyof KpiSet)[]) {
    const weight = w[key] ?? 0;
    const b = baseline[key].value, a = cand[key].value;
    const denom = Math.abs(b) > 1e-6 ? Math.abs(b) : 1;
    const gain = (LOWER_BETTER[key] === false ? a - b : b - a) / denom;
    total += weight * gain;
  }
  return total;
}

export interface AgentSpec {
  readonly id: AgentId;
  readonly label: string;
  readonly mandate: string;
  /** every action this agent could take, including the no-ops it will discard */
  readonly space: readonly { readonly id: string; readonly label: string; readonly apply: string | null }[];
  /** does this agent have a stake in this disturbance at all */
  readonly engaged: boolean;
}

export interface SolveInput {
  readonly lens: LensId;
  readonly baseline: KpiSet;
  /** run a policy through the scenario's own coupled models */
  readonly run: (apply: string | null) => KpiSet;
  readonly specs: readonly AgentSpec[];
  /** plans that cannot coexist: [winner, loser, why] */
  readonly conflicts: readonly (readonly [string, string, string])[];
}

export interface Solved {
  readonly result: SolveResult;
  /** adaptation ids the arbiter is putting forward, best first */
  readonly accepted: readonly string[];
}

/**
 * Run every agent's search, then arbitrate. Deterministic: same lens, same
 * disturbance, same seed gives the same plan, which is what lets a demo be
 * re-run identically.
 */
export function solve(input: SolveInput): Solved {
  const { lens, baseline, run, specs, conflicts } = input;

  const agents: AgentRun[] = [];
  /** each agent's own candidates, best first — an agent proposes ONE plan */
  const ranked = new Map<AgentId, { id: string; score: number }[]>();
  let evaluated = 0;

  for (const spec of specs) {
    const mine: { id: string; score: number }[] = [];
    let scored = 0;
    if (spec.engaged) {
      for (const action of spec.space) {
        const kpis = run(action.apply);
        const score = scoreFor(lens, baseline, kpis);
        scored += 1;
        if (action.apply !== null && score > 1e-4) mine.push({ id: action.apply, score });
      }
    }
    mine.sort((a, b) => b.score - a.score);
    ranked.set(spec.id, mine);
    evaluated += scored;
    agents.push({
      id: spec.id, label: spec.label, mandate: spec.mandate,
      engaged: spec.engaged, evaluated: scored, proposed: mine.length,
      best: mine[0]?.id ?? null, score: mine[0]?.score ?? 0,
    });
  }

  /* ---- arbitration ------------------------------------------------------
     Agents are taken in order of how much their best plan is worth. When one
     agent's plan makes another's impossible, the loser does not simply vanish
     — it falls back to its own next-best plan, and the console says why. That
     is the behaviour a curated list can never produce. */
  const order = [...ranked.entries()]
    .filter(([, m]) => m.length > 0)
    .sort((a, b) => (b[1][0]?.score ?? 0) - (a[1][0]?.score ?? 0));

  const labelOf = (id: string) =>
    specs.flatMap(sp => sp.space).find(a => a.apply === id)?.label ?? id;
  const ownerOf = (id: string): AgentId | null =>
    specs.find(sp => sp.space.some(a => a.apply === id))?.id ?? null;

  const rejected: Rejection[] = [];
  const accepted: string[] = [];
  for (const [agentId, mine] of order) {
    for (const cand of mine) {
      const clash = conflicts.find(([winner, loser]) => loser === cand.id && accepted.includes(winner));
      if (clash) {
        rejected.push({
          agent: agentId, against: ownerOf(clash[0]),
          label: labelOf(cand.id), reason: clash[2],
        });
        continue;                       // try this agent's next-best instead
      }
      accepted.push(cand.id);
      break;
    }
  }

  return { result: { agents, rejected, evaluated, lens }, accepted };
}
