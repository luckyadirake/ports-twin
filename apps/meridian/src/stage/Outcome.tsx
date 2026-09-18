import { useEffect, useState } from 'react';
import { show } from '@meridian/ui';
import { useFrame, useStore } from '../store';

/**
 * WHAT THE PLAN BOUGHT.
 *
 * Once a plan is committed the port keeps its data layer, so the change is
 * legible but quiet. This is the loud part: a band naming the outcome, and a
 * feed of what that plan looks like on the ground.
 *
 * The feed is deliberately an inset rather than a plate swap — these shots are
 * from their own cameras, so dissolving the main plate to one would slide the
 * registered overlay off the world it is registered to.
 */
export function Outcome() {
  const f = useFrame();
  const planT = useStore(s => s.planT);
  const commit = useStore(s => s.commit);
  /* a hotspot carries its own before/after now, and the two overlap in the
     same corner — the popup is the better view, so the feed stands down */
  const active = useStore(s => s.activeStep);
  const [feed, setFeed] = useState(true);

  const chosen = f?.scenario.comparison.chosen ?? null;
  useEffect(() => { setFeed(true); }, [chosen]);

  if (!f || !chosen || planT < 0.15) return null;
  const s = f.scenario;
  const base = s.comparison.baseline, adapt = s.comparison.adapted;

  const gains = ([
    ['vesselTurnaroundH', 'turnaround'],
    ['yardDigMoves', 'unproductive moves'],
    ['teuAtRisk', 'TEU exposed'],
    ['truckTurnTimeMin', 'truck turn'],
    ['anchorageWaitH', 'anchorage wait'],
    ['fuelTonnesSaved', 'bunkers saved'],
  ] as const)
    .map(([k, label]) => ({ k, label, a: base[k], b: adapt[k] }))
    .filter(g => Math.abs(g.a.value - g.b.value) > 0.05)
    .slice(0, 4);

  return (
    <>
      {s.afterClip && feed && active === null && (
        <div className="feed" style={{ opacity: planT }}>
          <div className="feed-hd m-num">
            <span className="feed-live" />quay feed · after
            <button onClick={() => setFeed(false)} title="Hide the feed">×</button>
          </div>
          <video key={s.afterClip} src={s.afterClip} autoPlay muted loop playsInline />
        </div>
      )}

      <div className="outcome" style={{ opacity: planT }}>
        <span className="outcome-tag m-num">
          plan committed
          {s.fixed.length > 0 && (
            <b>{s.fixed.length} link{s.fixed.length > 1 ? 's' : ''} repaired — open a ▶ on the port</b>
          )}
        </span>
        <span className="outcome-line">{s.outcome}</span>
        <span className="outcome-gains">
          {gains.map(g => (
            <span key={g.k} className="outcome-gain m-num">
              <s>{show(g.a)}</s><em>{show(g.b)}</em><i>{g.label}</i>
            </span>
          ))}
        </span>
        <button className="outcome-undo m-num" onClick={() => commit(chosen)}>REVERT</button>
      </div>
    </>
  );
}
