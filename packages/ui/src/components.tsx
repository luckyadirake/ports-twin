import { useState, type ReactNode, type CSSProperties } from 'react';
import type { Fact, DecisionBand } from '@meridian/contracts';
import { show, unitLabel } from './format';

type Tone = 'ink' | 'cyan' | 'mint' | 'amber' | 'red';

/* ------------------------------------------------------------------ glass -- */
export function Panel(
  { title, right, children, accent, style, className = '', collapsible, defaultOpen = true }:
  {
    title?: string; right?: ReactNode; children: ReactNode; accent?: boolean;
    style?: CSSProperties; className?: string; collapsible?: boolean; defaultOpen?: boolean;
  },
) {
  const [open, setOpen] = useState(defaultOpen);
  const shut = collapsible === true && !open;
  return (
    <section
      className={`m-panel ${accent ? 'm-panel--accent' : ''} ${shut ? 'm-panel--shut' : ''} ${className}`}
      style={style}
    >
      {title !== undefined && (
        <header className="m-panel-hd">
          {collapsible === true ? (
            <button
              className="m-panel-toggle" onClick={() => setOpen(v => !v)}
              aria-expanded={open} title={open ? 'Collapse' : 'Expand'}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"
                   style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 200ms var(--m-ease)' }}>
                <path d="M1.5 3 L4.5 6.2 L7.5 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span className="m-micro">{title}</span>
            </button>
          ) : <span className="m-micro">{title}</span>}
          {right !== undefined && <span style={{ marginLeft: 'auto' }}>{right}</span>}
        </header>
      )}
      {!shut && <div className="m-panel-bd">{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------- trust chip -- */
/** Every displayed number carries confidence, model version and lineage.
 *  A bare number is a lint error in this codebase — and a broken promise. */
export function TrustChip({ f }: { f: Fact<number> }) {
  const pct = Math.round(f.confidence * 100);
  const C = 2 * Math.PI * 3.4;
  const title =
    `confidence ${f.confidence.toFixed(2)} · model ${f.modelVersion}\n` +
    `as of ${new Date(f.asOf.t).toISOString().slice(11, 16)} on branch ${f.asOf.branch}\n` +
    `lineage: ${f.lineage.producedBy} ← ${f.lineage.inputs.join(', ') || 'L1'}`;
  return (
    <span className="m-trust" title={title} tabIndex={0}>
      <svg className="m-trust-arc" viewBox="0 0 9 9" aria-hidden="true">
        <circle cx="4.5" cy="4.5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".28" />
        <circle
          cx="4.5" cy="4.5" r="3.4" fill="none" stroke="var(--m-cyan)" strokeWidth="1.4"
          strokeDasharray={`${C * f.confidence} ${C}`} transform="rotate(-90 4.5 4.5)" strokeLinecap="round"
        />
      </svg>
      {pct}% · {f.modelVersion}
    </span>
  );
}

/* ---------------------------------------------------------------- metric --- */
export function Metric(
  { label, f, tone = 'ink', size = 'lg', bar, trust = true }:
  { label: string; f: Fact<number>; tone?: Tone; size?: 'stat' | 'lg' | 'sm'; bar?: number; trust?: boolean },
) {
  return (
    <div className="m-metric" data-tone={tone}>
      <span className="m-metric-label">{label}</span>
      <div className="m-metric-top">
        <span>
          <span className="m-metric-val m-num" data-size={size}>{show(f)}</span>
          {f.unit !== 'none' && <span className="m-metric-unit">{unitLabel(f.unit)}</span>}
        </span>
        {trust && <TrustChip f={f} />}
      </div>
      {bar !== undefined && (
        <div className="m-bar"><i style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }} /></div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ band --- */
export function Band({ band }: { band: DecisionBand }) {
  return <span className="m-band" data-band={band}><i />{band}</span>;
}

/** Band is enforced, not decorative: ADVISE is inert until a role is named. */
export function BandAction(
  { band, label, role, onAct }:
  { band: DecisionBand; label: string; role: string | null; onAct: () => void },
) {
  const locked = band === 'ADVISE' && role === null;
  return (
    <button
      onClick={locked ? undefined : onAct}
      disabled={locked}
      style={{
        width: '100%', padding: '8px 10px', borderRadius: 'var(--m-r)',
        border: '1px solid',
        borderColor: locked ? 'var(--m-ink-4)' : 'var(--m-cyan)',
        background: locked ? 'transparent' : 'var(--m-cyan-dim)',
        color: locked ? 'var(--m-ink-4)' : 'var(--m-cyan)',
        fontSize: 'var(--m-t-small)', fontWeight: 700,
        letterSpacing: '.06em', textTransform: 'uppercase',
        cursor: locked ? 'not-allowed' : 'pointer',
        transition: 'all var(--m-dur-ui) var(--m-ease)',
      }}
      title={locked ? 'ADVISE — select a role with authority to act' : label}
    >
      {locked ? 'Select a role to act' : label}
    </button>
  );
}

/* --------------------------------------------------------------- callout --- */
/** Anchor dot in the scene, thin leader, glass chip. Positions are container-%
 *  so the callout tracks the stage on resize. */
export function Callout(
  { x, y, dx, dy, title, children }:
  { x: number; y: number; dx: number; dy: number; title: string; children: ReactNode },
) {
  const w = Math.abs(dx) + 2, h = Math.abs(dy) + 2;
  return (
    <div className="m-callout" style={{ left: `${x}%`, top: `${y}%` }}>
      <span className="m-callout-dot" />
      <svg
        className="m-callout-line" width={w} height={h}
        style={{ left: Math.min(0, dx), top: Math.min(0, dy) }}
        viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
      >
        <line x1={dx < 0 ? w - 1 : 1} y1={dy < 0 ? h - 1 : 1} x2={dx < 0 ? 1 : w - 1} y2={dy < 0 ? 1 : h - 1} />
      </svg>
      <div className="m-callout-chip" style={{ left: dx, top: dy, transform: dx < 0 ? 'translateX(-100%)' : undefined }}>
        <div className="m-callout-chip-hd">{title}</div>
        <div className="m-callout-chip-bd">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ misc --- */
export function Micro({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span className="m-micro" style={style}>{children}</span>;
}

export function Rule() { return <div className="m-sep" />; }

/** Synthetic-data notice. Permanent, never dims, in every screenshot. */
export function SyntheticStrip() {
  return (
    <span
      className="m-num"
      style={{
        fontSize: 9.5, letterSpacing: '.1em', color: 'var(--m-amber)',
        border: '1px solid rgba(255,154,60,.4)', background: 'var(--m-amber-dim)',
        borderRadius: 2, padding: '2px 7px', whiteSpace: 'nowrap',
      }}
    >
      SYNTHETIC DATA — NOT PSA OPERATIONAL DATA
    </span>
  );
}
