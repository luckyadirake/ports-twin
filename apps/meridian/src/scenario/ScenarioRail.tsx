import { Panel, Micro } from '@meridian/ui';
import { useFrame, useStore } from '../store';
import { SCENARIO_LIST } from './list';

const LIST = SCENARIO_LIST.map((x, i) => ({ ...x, key: String(i + 1) }));

export function ScenarioRail() {
  const f = useFrame();
  const select = useStore(s => s.selectScenario);
  const setDisturbance = useStore(s => s.setDisturbance);
  if (!f) return null;
  const s = f.scenario;
  const d = s.disturbance;
  const pos = (v: number) => ((v - d.min) / (d.max - d.min)) * 100;
  const suffix = d.unit === 'h' ? 'h' : s.id === 'monsoon-sway' ? ' kt' : '';
  const opt = s.optimum;
  const up = s.polarity === 'improvement';

  return (
    <Panel title="Pose a scenario" accent collapsible>
      <div className="m-tabs" role="tablist">
        {LIST.map(x => (
          <button
            key={x.id} role="tab" aria-selected={s.id === x.id}
            className="m-tab scen-tab" onClick={() => select(x.id)}
          >
            <span className="scen-tab-l"><b>{x.label}</b><em>{x.scale}</em></span>
            <span className="m-tab-key">{x.key}</span>
          </button>
        ))}
      </div>

      <div className="m-sep" />

      <div className={`dist ${up ? 'dist--up' : ''}`}>
        <div className="dist-hd">
          <Micro>{d.label}</Micro>
          <span className="m-num dist-val">{d.value.toFixed(0)}{suffix}</span>
        </div>

        {/* Where each consequence switches on — probed from the same maths the
            model runs, so the ticks can never disagree with the outcome. */}
        <div className="dist-scale">
          <input
            id="disturbance" type="range"
            min={d.min} max={d.max} step={d.step} value={d.value}
            onChange={e => setDisturbance(Number(e.target.value))}
          />
          <div className="dist-ticks">
            {/* Where this lens would stop. Scanned from the same model the
                outcome comes from, so the star can never disagree with it. */}
            {opt && (
              <span
                className="dist-opt" style={{ left: `${pos(opt.value)}%` }}
                data-at={d.value >= opt.value}
                title={`${opt.label}. Others: ${opt.others.map(o => `${o.value} h`).join(', ')}`}
              ><i /></span>
            )}
            {s.thresholds.map(t => (
              <span
                key={t.label} className="dist-tick" data-sev={t.severity}
                style={{ left: `${pos(t.value)}%` }}
                data-passed={d.value >= t.value}
                title={`${t.label} at ${t.value}${suffix}`}
              ><i /></span>
            ))}
          </div>
        </div>

        <ul className="dist-legend">
          {s.thresholds.map(t => (
            <li key={t.label} data-sev={t.severity} data-passed={d.value >= t.value}>
              <span className="m-num">{t.value}{suffix}</span>{t.label}
            </li>
          ))}
        </ul>

        {opt && (
          <p className="dist-opt-note">
            <b className="m-num">{opt.label.toUpperCase()}</b>
            <span>
              {opt.others.length
                ? `Priced by the other lenses this sits at ${[...new Set(opt.others.map(o => o.value))].sort((a, b) => a - b).join(', ')} h. The disagreement is the point — each audience is buying something different.`
                : 'No other lens has a stake in this one.'}
            </span>
          </p>
        )}
        <p className="dist-cap m-num">{d.caption}</p>
      </div>
    </Panel>
  );
}
