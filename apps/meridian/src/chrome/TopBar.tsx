import { SyntheticStrip, show, simClock, relHours } from '@meridian/ui';
import { useFrame, useStore } from '../store';

export function TopBar() {
  const f = useFrame();
  const regret = f?.regret ?? null;
  const t0 = useStore(s => s.horizon[0]);
  void t0;

  return (
    <header className="topbar">
      <span className="topbar-mark m-num">MERIDIAN</span>
      <span className="topbar-ctx">PSA Tuas Port Singapore &middot; Berth T2</span>
      <SyntheticStrip />

      <div className="topbar-right">
        {f && (
          <span className="chip chip--mint m-num" title="Truck turn time — the landside twin of vessel turnaround">
            TTT {show(f.kpis.truckTurnTimeMin)}m
          </span>
        )}
        {regret && (
          <span className="chip chip--red m-num" title="Cost of the un-taken branch, per minute, running">
            REGRET S$ {show(regret.sgdPerMinute)}/min
          </span>
        )}
        {f && (
          <span className="m-num topbar-clock">
            {simClock(f.instant.t)} &nbsp;<span style={{ color: 'var(--m-ink-3)' }}>
              {relHours(f.instant.t, f.portHorizon.calls[0]?.eta.value ?? f.instant.t)}
            </span>
          </span>
        )}
      </div>
    </header>
  );
}
