import { useEffect, useState } from 'react';
import { Micro } from '@meridian/ui';
import type { SolvePhase } from '@meridian/contracts';
import { useFrame, useStore } from '../store';

/**
 * THE WORKLOG.
 *
 * What the agents did, while they are doing it. The counters are the real
 * candidate counts from the search and the rejections are real conflicts — the
 * pacing is presentation, but nothing shown here is invented, which is the
 * whole difference between this and a spinner that says "AI is thinking".
 */
const BEATS: { phase: SolvePhase; label: string }[] = [
  { phase: 'brief', label: 'Brief' },
  { phase: 'solve', label: 'Solve' },
  { phase: 'arbitrate', label: 'Arbitrate' },
  { phase: 'simulate', label: 'Simulate' },
  { phase: 'render', label: 'Render' },
  { phase: 'report', label: 'Report' },
];
const ORDER: SolvePhase[] = ['brief', 'solve', 'arbitrate', 'simulate', 'render', 'report'];

export function AgentWork() {
  const f = useFrame();
  const phase = useStore(s => s.solvePhase);
  const runSolve = useStore(s => s.runSolve);
  const [tick, setTick] = useState(0);

  /* count up to the real number rather than snapping to it — the only
     theatre here, and it is over in a second */
  useEffect(() => {
    if (phase !== 'solve') { setTick(1); return; }
    setTick(0);
    let raf = 0;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1100);
      setTick(k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (!f) return null;
  const sv = f.scenario.solve;
  const at = ORDER.indexOf(phase);
  const running = at >= 0;
  const engaged = sv.agents.filter(a => a.engaged);

  return (
    <div className="agw" data-running={running}>
      <div className="agw-hd">
        <Micro>Agents</Micro>
        <span className="agw-sum m-num">
          {sv.evaluated} plans evaluated · {sv.agents.reduce((n, a) => n + a.proposed, 0)} beat doing nothing · priced for {sv.lens}
        </span>
        <button className="agw-run m-num" onClick={runSolve} title="Run the agents again">
          {running ? '…' : 'SOLVE'}
        </button>
      </div>

      <div className="agw-beats">
        {BEATS.map((b, i) => (
          <span key={b.phase} className="agw-beat m-num"
            data-on={running && i <= at} data-now={phase === b.phase}>{b.label}</span>
        ))}
      </div>

      <ul className="agw-list">
        {sv.agents.map(a => {
          const dark = !a.engaged;
          const n = Math.round(a.evaluated * (phase === 'solve' ? tick : 1));
          return (
            <li key={a.id} className="agw-agent" data-dark={dark} title={a.mandate}>
              <span className="agw-dot" />
              <span className="agw-name">{a.label}</span>
              <span className="agw-mandate">{dark ? 'no stake in this one' : a.mandate}</span>
              <span className="agw-n m-num">
                {dark ? '—' : <>{a.proposed}<i>/{n}</i></>}
              </span>
            </li>
          );
        })}
      </ul>

      {sv.rejected.length > 0 && (phase === 'idle' || at >= ORDER.indexOf('arbitrate')) && (
        <ul className="agw-rej">
          {sv.rejected.map((r, i) => (
            <li key={i}>
              <span className="agw-x m-num">✕</span>
              <span>
                <b>{r.label}</b>
                <em>{r.reason}</em>
              </span>
            </li>
          ))}
        </ul>
      )}

      {engaged.length > 0 && phase === 'idle' && sv.rejected.length === 0 && (
        <p className="agw-note m-num">no conflicts — every plan below can stand on its own</p>
      )}
    </div>
  );
}
