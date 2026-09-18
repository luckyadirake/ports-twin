import { Panel, Band, show } from '@meridian/ui';
import { useFrame, useStore } from '../store';
import { AgentWork } from './AgentWork';

/**
 * Adaptations, filtered by what this audience actually has authority over.
 * Collapsible, because the port is the point and the rail should be able to
 * get out of its way.
 */
export function AdaptPanel() {
  const f = useFrame();
  const commit = useStore(s => s.commit);
  const chooseB = useStore(s => s.chooseAdaptationB);
  const phase = useStore(s => s.solvePhase);
  const role = useStore(s => s.role);
  const setRole = useStore(s => s.setRole);
  if (!f) return null;
  const s = f.scenario;
  const { chosen, chosenB } = s.comparison;
  /* authority is expressed as families of action now, because the agents
     search a space rather than pick from a list — 'surge-' covers every crane
     split the berth agent might land on */
  const allowed = s.facet.allowed;
  const permit = (id: string) => allowed.length === 0 || allowed.some(p => id.startsWith(p));
  const solving = phase === 'brief' || phase === 'solve' || phase === 'arbitrate';

  return (
    <Panel
      title="Adapt" collapsible
      right={<span className="m-num adaptstrip-auth">
        {s.adaptations.filter(a => permit(a.id)).length}/{s.adaptations.length} in your authority
      </span>}
    >
      <AgentWork />
      {solving && <p className="agw-pending m-num">agents are still solving…</p>}
      {!solving && s.adaptations.map(a => {
        const isA = chosen === a.id, isB = chosenB === a.id;
        const permitted = permit(a.id);
        return (
          <div key={a.id} className="acard" data-on={isA || isB} data-rec={a.recommended} data-locked={!permitted}>
            <button className="acard-main" onClick={() => commit(a.id)} disabled={!permitted}>
              <span className="acard-hd"><b>{a.label}</b><Band band={a.band} /></span>
              <em className="acard-why">{a.rationale}</em>
              <span className="acard-num m-num">
                {a.costs.map((c, i) => <span key={`c${i}`} className="cost">−{show(c)} {c.unit === 'none' ? '' : c.unit}</span>)}
                {a.saves.filter(x => x.value > 0.05).map((c, i) => <span key={`s${i}`} className="save">+{show(c)} {c.unit === 'none' ? '' : c.unit}</span>)}
                {a.recommended && <span className="rec">agents rank this first</span>}
                {!permitted && <span className="locked">outside this role</span>}
              </span>
            </button>
            <div className="acard-ab m-num">
              <button data-on={isA} onClick={() => commit(a.id)} disabled={!permitted}>A</button>
              <button data-on={isB} onClick={() => chooseB(isB ? null : a.id)} disabled={!permitted || !chosen || isA}>B</button>
            </div>
          </div>
        );
      })}
      <select
        className="role-select m-num" id="role"
        value={role ?? ''} onChange={e => setRole(e.target.value === '' ? null : (e.target.value as never))}
      >
        <option value="">No role selected</option>
        <option value="DUTY_MANAGER">Duty manager</option>
        <option value="CRANE_ENGINEER">Crane engineer</option>
        <option value="NETWORK_PLANNER">Network planner</option>
      </select>
    </Panel>
  );
}
