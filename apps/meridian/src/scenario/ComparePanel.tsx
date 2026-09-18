import { Panel, TrustChip, show, Micro } from '@meridian/ui';
import type { KpiSet } from '@meridian/contracts';
import { useFrame } from '../store';
import { KPI_LABEL, LOWER_BETTER } from '../lenses/labels';

/**
 * THE REAL COMPARISON. Genuine runs from one seed, differing only in policy:
 * what happens if nobody acts, against one or two chosen adaptations.
 */
export function ComparePanel() {
  const f = useFrame();
  if (!f) return null;
  const s = f.scenario;
  const c = s.comparison;
  const live = c.chosen !== null;
  const hasB = c.adaptedB !== null;
  const rows = s.facet.kpis;
  const nameOf = (id: string | null) => s.adaptations.find(a => a.id === id)?.label ?? '—';
  const up = s.polarity === 'improvement';

  const cell = (k: keyof KpiSet, set: KpiSet | null) => {
    if (!set) return <span className="m-num cmp-c">—</span>;
    const b = c.baseline[k], a = set[k];
    const lower = LOWER_BETTER[k];
    const better = lower ? a.value < b.value - 1e-6 : a.value > b.value + 1e-6;
    const worse = lower ? a.value > b.value + 1e-6 : a.value < b.value - 1e-6;
    return <span className={`m-num cmp-c ${better ? 'good' : worse ? 'bad' : ''}`}>{show(a)}</span>;
  };

  return (
    <Panel title={up ? 'Today vs committed' : 'Baseline vs adapted'} accent={live} collapsible>
      <div className={`cmp-hd m-num ${hasB ? 'three' : ''}`}>
        <span>metric</span>
        <span className="cmp-c">{up ? 'today' : 'do nothing'}</span>
        <span className="cmp-c" title={nameOf(c.chosen)}>option A</span>
        {hasB && <span className="cmp-c" title={nameOf(c.chosenB)}>option B</span>}
      </div>
      {rows.map(k => (
        <div className={`cmp-row ${hasB ? 'three' : ''}`} key={k}>
          <span className="cmp-label">{KPI_LABEL[k]}</span>
          <span className="m-num cmp-c cmp-base">{show(c.baseline[k])}</span>
          {cell(k, live ? c.adapted : null)}
          {hasB && cell(k, c.adaptedB)}
        </div>
      ))}

      <div className="m-sep" />
      <div className="cmp-delta">
        <div>
          <Micro>{up ? 'Value per call' : 'Value of acting'}</Micro>
          <div className="m-num cmp-delta-v" data-pos={c.deltaSgd.value >= 0}>
            {c.deltaSgd.value >= 0 ? '+' : '−'}S$ {show({ ...c.deltaSgd, value: Math.abs(c.deltaSgd.value) })}
          </div>
        </div>
        <TrustChip f={c.deltaSgd} />
      </div>
      <div className="cmp-sub m-num">
        {show(c.deltaHours)} h turnaround · {show(c.deltaTeu)} TEU protected
      </div>
      {!live && <p className="cmp-note">{up ? 'Choose a publishing policy to run the second branch.' : 'Choose an adaptation to run the second branch.'}</p>}
    </Panel>
  );
}
