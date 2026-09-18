import { useEffect, useState } from 'react';
import { TrustChip, show, Band } from '@meridian/ui';
import { useFrame, useStore } from '../store';

const SCALE_LABEL: Record<string, string> = { ASSET: 'Asset', FLEET: 'Fleet', TERMINAL: 'Terminal', PORT: 'Port' };

/**
 * Click a hotspot on the port and the link opens where it is happening.
 *
 * Once a committed plan has repaired that link there are two shots of it — the
 * same camera in the same weather, differing only in what the plan changed — so
 * the popup becomes a before/after and opens on AFTER, because that is the
 * thing the operator just bought.
 */
export function HotspotPopup() {
  const f = useFrame();
  const i = useStore(s => s.activeStep);
  const setActive = useStore(s => s.setActive);
  const planT = useStore(s => s.planT);
  const [showAfter, setShowAfter] = useState(true);

  const repaired = i !== null && planT > 0.4
    && (f?.scenario.fixed.includes(i) ?? false)
    && (f?.scenario.chain[i]?.clipAfter !== undefined);

  /* open on the after state each time a link is opened or a plan lands */
  useEffect(() => { setShowAfter(true); }, [i, repaired]);

  if (!f || i === null) return null;
  const step = f.scenario.chain[i];
  if (!step) return null;
  const r = f.scenario.facet.retell[i];
  const anchorRight = (step.anchor?.[0] ?? 0.5) > 0.55;

  const before = r?.clip ?? step.clip;
  const src = repaired && showAfter ? step.clipAfter! : before;

  /* the numbers have to follow the footage. Showing the after shot beside the
     disturbance's own figures is the same lie as a video that changes for
     effect — so when AFTER is up, the link reads its repaired value. */
  const k = step.kpi;
  const onAfter = repaired && showAfter && k !== undefined;
  const wasFact = k !== undefined ? f.scenario.comparison.baseline[k] : null;
  const nowFact = k !== undefined ? f.scenario.comparison.adapted[k] : null;

  return (
    <div className="hotpop" data-side={anchorRight ? 'l' : 'r'} data-fixed={repaired}>
      <div className="hotpop-hd">
        <span className="hotpop-n m-num" data-sev={repaired ? 'ok' : step.severity}>
          {repaired ? '✓' : i + 1}
        </span>
        <span className="m-micro">{SCALE_LABEL[step.scale]} &middot; {step.clock}</span>
        <button className="m-num hotpop-x" onClick={() => setActive(null)}>CLOSE</button>
      </div>

      <div className="hotpop-media">
        <video className="hotpop-video" key={src} src={src} autoPlay muted loop playsInline />
        {repaired && (
          <div className="hotpop-ab m-num">
            <button data-on={!showAfter} onClick={() => setShowAfter(false)}>BEFORE</button>
            <button data-on={showAfter} onClick={() => setShowAfter(true)}>AFTER</button>
          </div>
        )}
        {repaired && showAfter && (
          <span className="hotpop-stamp m-num">under the committed plan</span>
        )}
      </div>

      <div className="hotpop-bd">
        <b>{r ? r.title : step.title}</b>
        <p>{r ? r.detail : step.detail}</p>
        {onAfter && f.scenario.outcome && (
          <p className="hotpop-plan">{f.scenario.outcome}</p>
        )}
        <div className="hotpop-fact" data-after={onAfter}>
          {onAfter && wasFact && nowFact ? (
            <span className="m-num hotpop-delta">
              <s>{show(wasFact)}</s> → <em>{show(nowFact)}</em>
            </span>
          ) : step.from && step.to ? (
            <span className="m-num hotpop-delta"><s>{step.from}</s> → <em>{step.to}</em></span>
          ) : null}
          <span className="m-num hotpop-val">
            {onAfter && nowFact ? show(nowFact) : show(step.fact)}
          </span>
          <TrustChip f={onAfter && nowFact ? nowFact : step.fact} />
        </div>
        {step.fact.band && <Band band={step.fact.band} />}
      </div>
    </div>
  );
}
