import { useEffect, useRef } from 'react';
import { show } from '@meridian/ui';
import { useFrame, useStore } from '../store';

/**
 * THE CASCADE.
 *
 * The chain of consequence IS a timeline — each link lands on a different
 * clock, from a 50 ms gust to a broken connection three days out. Plotting it
 * on a log-time axis makes propagation something you watch travel rather than
 * a list you read, and gives the bottom band an actual job.
 */
const T_MIN = 20, T_MAX = 7 * 24 * 3600 * 1000;
const lx = (ms: number) => (Math.log(Math.max(T_MIN, ms)) - Math.log(T_MIN)) / (Math.log(T_MAX) - Math.log(T_MIN));

const TICKS = [
  { ms: 100, label: '100 ms' }, { ms: 1000, label: '1 s' }, { ms: 60_000, label: '1 min' },
  { ms: 3600_000, label: '1 hour' }, { ms: 86400_000, label: '1 day' }, { ms: 604800_000, label: '1 week' },
];
const SCALE_LABEL: Record<string, string> = { ASSET: 'Asset', FLEET: 'Fleet', TERMINAL: 'Terminal', PORT: 'Port' };

export function Cascade() {
  const f = useFrame();
  const setHovered = useStore(s => s.setHovered);
  const setActive = useStore(s => s.setActive);
  const revealTo = useStore(s => s.revealTo);
  const hovered = useStore(s => s.hoveredStep);
  const active = useStore(s => s.activeStep);
  const revealed = useStore(s => s.revealed);
  const setRevealed = useStore(s => s.setRevealed);
  const open = useStore(s => s.cascadeOpen);
  const setOpen = useStore(s => s.setCascadeOpen);
  const prev = useRef<string>('');

  const links = f?.scenario.chain.length ?? 0;
  const key = f ? `${f.scenario.id}:${f.scenario.disturbance.value}:${f.scenario.facet.lens}` : '';
  useEffect(() => {
    if (!key || key === prev.current) return;
    prev.current = key;
    setRevealed(0);
    /* staggered, and driven by the chain's own length — a scenario with eight
       links must not stall at five */
    const step = links > 6 ? 170 : 230;
    const timers = Array.from({ length: links }, (_, i) =>
      setTimeout(() => setRevealed(i + 1), 120 + i * step));
    return () => timers.forEach(clearTimeout);
  }, [key, links, setRevealed]);

  if (!f) return null;
  const s = f.scenario;
  const retell = s.facet.retell;

  /* Log time bunches the late links together — 34 h, 2 days and a week all sit
     inside the last tenth of the axis. Rather than shrink the labels until they
     cannot be read, stack a node onto the next free row. The dot stays on its
     true time; only the label moves. */
  const dense = open && s.chain.length > 6;
  /* Compact is the default: the band is a reading rail, not a report. The
     detail already lives in the hotspot popup on the port, where the link is
     actually happening — repeating it down here costs the scene its height. */
  const MIN_GAP = open ? (dense ? 9.6 : 11) : 6.2;
  const maxRows = open ? 3 : 2;
  const rows: number[] = [];
  const lastX: number[] = [-99];
  for (const st of s.chain) {
    const x = lx(st.atMs) * 100;
    let r = lastX.findIndex(lx0 => x - lx0 >= MIN_GAP);
    if (r === -1) {
      if (lastX.length < maxRows) { lastX.push(-99); r = lastX.length - 1; }
      else r = 0;                       // nowhere left to go; overlap honestly
    }
    lastX[r] = x;
    rows.push(r);
  }

  return (
    <div className={`cascade m-panel ${open ? '' : 'cascade--compact'}`}>
      <div className="cascade-hd">
        <button
          className="cascade-toggle" onClick={() => setOpen(!open)} aria-expanded={open}
          title={open ? 'Compact timeline — give the height back to the port' : 'Expand the timeline'}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"
            style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 180ms' }}>
            <path d="M1.5 3 L4.5 6.2 L7.5 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <span className="m-micro">
          {s.polarity === 'improvement' ? 'Propagation · one decision' : 'Propagation · one disturbance'}
          {` · ${s.chain.length} clocks`}
        </span>
        <span className="cascade-lens m-num">{s.facet.headline}</span>
        <button className="m-num cascade-replay" onClick={() => {
          prev.current = ''; setRevealed(0);
          const step = s.chain.length > 6 ? 170 : 230;
          s.chain.forEach((_, i) => setTimeout(() => setRevealed(i + 1), 120 + i * step));
        }}>REPLAY</button>
      </div>

      <div className={`cascade-track ${dense ? 'cascade-track--dense' : ''}`}>
        <div className="cascade-axis">
          {TICKS.map(t => (
            <span key={t.ms} className="m-num" style={{ left: `${lx(t.ms) * 100}%` }}>{t.label}</span>
          ))}
        </div>
        <div className="cascade-line" />

        {s.chain.map((step, i) => {
          const x = lx(step.atMs) * 100;
          const row = rows[i] ?? 0;
          const on = i < revealed;
          const r = retell[i];
          const next = s.chain[i + 1];
          return (
            <div key={i}>
              {next && (
                <div
                  className="cascade-link" data-on={i + 1 < revealed}
                  style={{ left: `${x}%`, width: `${lx(next.atMs) * 100 - x}%` }}
                >
                  {/* the causal verb needs room to be read; on a crowded span
                      the link itself still draws, it just goes unlabelled */}
                  {lx(next.atMs) * 100 - x > 11 && <span className="m-num">{next.because}</span>}
                </div>
              )}
              <button
                className="cascade-node" data-sev={step.severity} data-on={on}
                data-hot={hovered === i || active === i}
                style={{ left: `${Math.min(95.5, Math.max(4.5, x))}%` }} data-row={row}
                onMouseEnter={() => { setHovered(i); revealTo(i); }}
                onMouseLeave={() => setHovered(null)}
                onClick={() => { revealTo(i); setActive(active === i ? null : i); }}
              >
                <span className="cascade-dot"><i>{i + 1}</i></span>
                <span className="cascade-body">
                  <span className="cascade-scale m-num">{SCALE_LABEL[step.scale]} &middot; {step.clock}</span>
                  <b>{r ? r.title : step.short}</b>
                  {step.from && step.to && (
                    <span className="cascade-delta m-num">
                      <s>{step.from}</s> <em>{step.to}</em>
                    </span>
                  )}
                  <span className="cascade-val m-num">{show(step.fact)}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
