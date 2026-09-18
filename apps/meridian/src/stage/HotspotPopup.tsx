import { TrustChip, show, Band } from '@meridian/ui';
import { useFrame, useStore } from '../store';

const SCALE_LABEL: Record<string, string> = { ASSET: 'Asset', FLEET: 'Fleet', TERMINAL: 'Terminal', PORT: 'Port' };

/** Click a hotspot on the port and the link opens where it is happening. */
export function HotspotPopup() {
  const f = useFrame();
  const i = useStore(s => s.activeStep);
  const setActive = useStore(s => s.setActive);
  if (!f || i === null) return null;
  const step = f.scenario.chain[i];
  if (!step) return null;
  const r = f.scenario.facet.retell[i];
  const anchorRight = (step.anchor?.[0] ?? 0.5) > 0.55;

  return (
    <div className="hotpop" data-side={anchorRight ? 'l' : 'r'}>
      <div className="hotpop-hd">
        <span className="hotpop-n m-num" data-sev={step.severity}>{i + 1}</span>
        <span className="m-micro">{SCALE_LABEL[step.scale]} &middot; {step.clock}</span>
        <button className="m-num hotpop-x" onClick={() => setActive(null)}>CLOSE</button>
      </div>
      <video className="hotpop-video" key={r?.clip ?? step.clip} src={r?.clip ?? step.clip} autoPlay muted loop playsInline />
      <div className="hotpop-bd">
        <b>{r ? r.title : step.title}</b>
        <p>{r ? r.detail : step.detail}</p>
        <div className="hotpop-fact">
          {step.from && step.to && (
            <span className="m-num hotpop-delta"><s>{step.from}</s> → <em>{step.to}</em></span>
          )}
          <span className="m-num hotpop-val">{show(step.fact)}</span>
          <TrustChip f={step.fact} />
        </div>
        {step.fact.band && <Band band={step.fact.band} />}
      </div>
    </div>
  );
}
