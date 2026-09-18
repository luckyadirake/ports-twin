import type { LensId } from '@meridian/contracts';
import { useFrame, useStore } from '../store';

const DOTS = ['quiet', 'touched', 'involved', 'in the room'];

/**
 * WHO THIS WAKES UP. Eight audiences, severity computed from the scenario.
 * One glance says how many teams a single disturbance actually involves —
 * and it doubles as the lens switcher, so the answer is one click away.
 */
export function AudienceRow() {
  const f = useFrame();
  const lens = useStore(s => s.lens);
  const setLens = useStore(s => s.setLens);
  if (!f) return null;
  const a = f.scenario.audiences;
  const woken = a.filter(x => x.severity >= 2).length;
  /* A gain is not a threat. Same widget, opposite sign language. */
  const up = f.scenario.polarity === 'improvement';

  return (
    <div className="aud" data-pol={f.scenario.polarity}>
      <span className="aud-lead m-num">
        {up ? 'LIFTS' : 'WAKES'} <b>{woken}</b> OF 8 TEAMS
      </span>
      {a.map(x => (
        <button
          key={x.lens} className="aud-item" data-sev={x.severity} data-on={lens === x.lens}
          onClick={() => setLens(x.lens as LensId)}
          title={`${x.label} — ${DOTS[x.severity]}\n${x.headline}`}
        >
          <span className="aud-bar"><i /><i /><i /></span>
          <span className="aud-label">{x.label}</span>
        </button>
      ))}
    </div>
  );
}
