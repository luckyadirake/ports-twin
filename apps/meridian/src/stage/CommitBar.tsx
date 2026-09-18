import { show } from '@meridian/ui';
import { useFrame, useStore } from '../store';

/**
 * The decision, made explicit.
 *
 * Selecting a plan projects it; it is this bar — and only this bar — that turns
 * a projection into something the terminal is actually going to do. Keeping the
 * two apart is the whole point: an operator should never discover they have
 * committed to something by clicking to look at it.
 */
export function CommitBar() {
  const f = useFrame();
  const previewId = useStore(s => s.previewId);
  const preview = useStore(s => s.preview);
  const commit = useStore(s => s.commit);
  if (!f || !previewId) return null;
  const pv = f.scenario.preview;
  if (!pv) return null;

  const base = f.scenario.comparison.baseline;
  const gains = ([
    ['vesselTurnaroundH', 'turnaround'],
    ['yardDigMoves', 'unproductive moves'],
    ['teuAtRisk', 'TEU exposed'],
    ['truckTurnTimeMin', 'truck turn'],
  ] as const)
    .map(([k, label]) => ({ label, a: base[k], b: pv.kpis[k] }))
    .filter(g => Math.abs(g.a.value - g.b.value) > 0.05)
    .slice(0, 3);

  return (
    <div className="commit">
      <div className="commit-l">
        <span className="commit-tag m-num">{(pv.agent ?? 'agents').toUpperCase()} PROPOSES</span>
        <b>{pv.label}</b>
      </div>
      <div className="commit-gains">
        {gains.map(g => (
          <span key={g.label} className="commit-gain m-num">
            <s>{show(g.a)}</s><em>{show(g.b)}</em><i>{g.label}</i>
          </span>
        ))}
        {gains.length === 0 && <span className="commit-gain m-num"><i>no material change</i></span>}
      </div>
      <button className="commit-no m-num" onClick={() => preview(null)}>DISMISS</button>
      <button className="commit-go m-num" onClick={() => commit(previewId)}>COMMIT PLAN</button>
    </div>
  );
}
