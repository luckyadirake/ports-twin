import { Panel, Metric, Band, BandAction, TrustChip, Micro, show, heat, vsEnvelope } from '@meridian/ui';
import type { KpiSet } from '@meridian/contracts';
import { LENSES } from '../lenses/configs';
import { useFrame, useStore } from '../store';

const LABEL: Record<keyof KpiSet, string> = {
  vesselTurnaroundH: 'Vessel turnaround', movesPerHour: 'Gang rate',
  yardDigMoves: 'Re-handles', yardRehandleRate: 'Re-handle rate',
  truckTurnTimeMin: 'Truck turn time', gateSlotsForfeited: 'Appointments lapsed',
  connectionsAtRisk: 'Connections at risk', teuAtRisk: 'TEU at risk',
  energyKwhPerMove: 'Energy per move', co2gPerMove: 'Carbon per move',
  demurrageExposure: 'Demurrage exposure', assetAvailabilityPct: 'Asset availability',
  anchorageWaitH: 'Anchorage wait', fuelTonnesSaved: 'Bunkers saved',
};

const NORM: Partial<Record<keyof KpiSet, number>> = {
  movesPerHour: 40, vesselTurnaroundH: 48, yardDigMoves: 2000, truckTurnTimeMin: 60,
  teuAtRisk: 5000, assetAvailabilityPct: 100, energyKwhPerMove: 6, co2gPerMove: 2500,
  demurrageExposure: 800000, connectionsAtRisk: 8, gateSlotsForfeited: 500,
  yardRehandleRate: 0.5, anchorageWaitH: 12, fuelTonnesSaved: 140,
};

/** Terminal operations panel — the reference's top-left card. */
export function OpsPanel() {
  const f = useFrame();
  const lens = useStore(s => s.lens);
  if (!f) return null;
  const cfg = LENSES[lens];
  const tone = (k: keyof KpiSet) =>
    k === 'teuAtRisk' || k === 'connectionsAtRisk' || k === 'demurrageExposure' ? 'red'
      : k === 'yardDigMoves' || k === 'gateSlotsForfeited' ? 'amber'
      : k === 'movesPerHour' || k === 'assetAvailabilityPct' ? 'mint' : 'cyan';

  return (
    <Panel title={cfg.label} accent right={<Micro style={{ color: 'var(--m-ink-4)' }}>{cfg.audience}</Micro>}>
      {cfg.kpis.map((k, i) => {
        const fv = f.kpis[k];
        const label = cfg.vocabulary[`kpis.${k}`] ?? LABEL[k];
        return (
          <Metric
            key={k} label={label} f={fv} tone={tone(k)}
            size={i === 0 ? 'stat' : 'lg'}
            bar={(fv.value as number) / (NORM[k] ?? 100)}
          />
        );
      })}
    </Panel>
  );
}

/** Equipment panel — the twin side of the reference. */
export function EquipmentPanel() {
  const f = useFrame();
  if (!f) return null;
  return (
    <Panel title="Equipment">
      <div style={{ display: 'grid', gap: 7 }}>
        {f.assets.map(a => {
          const t = vsEnvelope(a.windingTempC, a.envelope.tempC);
          const over = a.windingTempC > a.envelope.tempC;
          return (
            <div key={a.id} className="equip-row">
              <span className="m-num equip-id" style={{ color: over ? 'var(--m-red)' : 'var(--m-ink-2)' }}>{a.id}</span>
              <span className="equip-heat"><i style={{ width: `${Math.max(6, t * 100)}%`, background: heat(t) }} /></span>
              <span className="m-num equip-val" style={{ color: heat(t) }}>{a.windingTempC.toFixed(0)}&deg;C</span>
              <span className="m-num equip-rul">{show(a.rulHours)}h</span>
            </div>
          );
        })}
      </div>
      <Micro style={{ color: 'var(--m-ink-4)', fontSize: 9 }}>winding temp vs envelope 105&deg;C &middot; remaining life</Micro>
    </Panel>
  );
}

/** Inspector — the dig calculation is the headline of the port edition. */
export function Inspector() {
  const f = useFrame();
  const role = useStore(s => s.role);
  const setRole = useStore(s => s.setRole);
  const send = useStore(s => s.send);
  if (!f) return null;
  const dig = f.terminal.dig['3C'];
  const pre = f.terminal.presequence;
  if (!dig || !pre) return null;

  return (
    <Panel title="Block 3C · retrieval" accent>
      <Metric label="Re-handle cost" f={dig.unproductive} tone="red" size="stat" />
      <div className="kv">
        <span>targets buried</span><span className="m-num">{show(dig.productive)}</span>
        <span>mean dig depth</span><span className="m-num">{show(dig.meanDigDepth)} tiers</span>
        <span>ASC time</span><span className="m-num">{(dig.ascSeconds.value / 3600).toFixed(1)} h</span>
      </div>

      <div className="m-sep" />
      <Micro>Ranked options</Micro>
      <div className="opt opt--best">
        <div className="opt-hd">
          <span>Pre-sequence in the 18:00 lull</span><Band band={pre.band} />
        </div>
        <div className="m-num opt-sub">
          {show(pre.movesNow)} moves now &middot; saves {show(pre.movesSaved)} &middot;
          net <b style={{ color: pre.net.value > 0 ? 'var(--m-mint)' : 'var(--m-red)' }}>
            {pre.net.value > 0 ? '−' : '+'}{Math.abs(pre.net.value)}
          </b>
        </div>
        <div className="opt-sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <TrustChip f={pre.net} />
          <span className="m-num" style={{ color: 'var(--m-ink-4)', fontSize: 9.5 }}>
            ASC idle used {show(pre.ascIdleUsedPct)}%
          </span>
        </div>
      </div>
      <div className="opt"><div className="opt-hd"><span>Partial — top two tiers</span></div></div>
      <div className="opt"><div className="opt-hd"><span>Do nothing</span></div></div>

      <select
        className="role-select m-num"
        value={role ?? ''}
        onChange={e => setRole(e.target.value === '' ? null : (e.target.value as never))}
      >
        <option value="">No role selected</option>
        <option value="DUTY_MANAGER">Duty manager</option>
        <option value="CRANE_ENGINEER">Crane engineer</option>
        <option value="NETWORK_PLANNER">Network planner</option>
      </select>
      <BandAction
        band={pre.band} role={role} label={`Commit · ${pre.band}`}
        onAct={() => send({ kind: 'intervene', action: { type: 'presequenceYard', blockId: '3C', window: pre.window } })}
      />
    </Panel>
  );
}

/** The federation set-piece: what crossed the boundary, and what did not. */
export function SovereigntyDrawer() {
  const f = useFrame();
  const open = useStore(s => s.drawerOpen);
  const setDrawer = useStore(s => s.setDrawer);
  const entry = f?.portHorizon.community[0];
  if (!open || !entry) return null;

  return (
    <div className="drawer">
      <Panel
        title="Sovereignty ledger"
        right={<button className="m-num drawer-x" onClick={() => setDrawer(false)}>CLOSE</button>}
      >
        <div className="kv">
          <span>asked</span><span className="m-num">{entry.query.askedParty} &middot; {entry.query.party}</span>
          <span>subject</span><span className="m-num">{entry.query.subject}</span>
          <span>latency</span><span className="m-num">{entry.latencyMs} ms</span>
        </div>
        <div className="ledger-why">{entry.query.purpose}</div>

        <Micro style={{ color: 'var(--m-mint)' }}>Disclosed &middot; {entry.disclosed.length} fields crossed</Micro>
        {entry.disclosed.map(d => (
          <div key={d.field} className="led led--ok">
            <span className="m-num">{d.field}</span><b className="m-num">{d.value}</b>
            <em>{d.reason}</em>
          </div>
        ))}

        <Micro style={{ color: 'var(--m-red)' }}>Withheld &middot; never left their systems</Micro>
        {entry.withheld.map(d => (
          <div key={d.field} className="led led--no">
            <span className="m-num">{d.field}</span><em>{d.reason}</em>
          </div>
        ))}

        <div className="ledger-note">
          Haulier state is held in a separate module with no import path to this store.
        </div>
      </Panel>
    </div>
  );
}
