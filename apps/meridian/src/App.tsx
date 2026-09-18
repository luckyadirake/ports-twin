import { useEffect } from 'react';
import { PlateStage } from './stage/PlateStage';
import { HotspotPopup } from './stage/HotspotPopup';
import { CommitBar } from './stage/CommitBar';
import { Outcome } from './stage/Outcome';
import { TopBar } from './chrome/TopBar';
import { ScenarioRail } from './scenario/ScenarioRail';
import { AdaptPanel } from './scenario/AdaptPanel';
import { ComparePanel } from './scenario/ComparePanel';
import { Cascade } from './scenario/Cascade';
import { AudienceRow } from './scenario/AudienceRow';
import { LENS_ORDER } from './lenses/configs';
import { startKernel, useFrame, useStore } from './store';
import { SCENARIO_LIST } from './scenario/list';

export default function App() {
  const f = useFrame();
  const ready = useStore(s => s.ready);
  const schematic = useStore(s => s.schematic);
  const motion = useStore(s => s.motion);

  useEffect(() => startKernel(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) return;
      const st = useStore.getState();
      const n = Number(e.key);
      if (n >= 1 && n <= SCENARIO_LIST.length) st.selectScenario(SCENARIO_LIST[n - 1]!.id);
      if (e.key.toLowerCase() === 's') st.setSchematic(!st.schematic);
      if (e.key.toLowerCase() === 'm') st.setMotion(!st.motion);
      if (e.key === 'Escape') st.setActive(null);
      if (e.key.toLowerCase() === 'l') {
        const i = LENS_ORDER.indexOf(st.lens);
        st.setLens(LENS_ORDER[(i + 1) % LENS_ORDER.length]!);
      }
      const d = st.frames[0]?.scenario.disturbance;
      if (d && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        st.setDisturbance(Math.min(d.max, Math.max(d.min, d.value + (e.key === 'ArrowRight' ? d.step : -d.step))));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />

      <main className="stage">
        <PlateStage />

        <div className="rail rail--l"><ScenarioRail /></div>
        <div className="rail rail--r"><AdaptPanel /><ComparePanel /></div>

        {f && (
          <div className="scen-title">
            <h1>{f.scenario.label}</h1>
            <p>{f.scenario.subtitle}</p>
          </div>
        )}

        <div className="viewbar">
          <button className="m-num" data-on={!schematic} onClick={() => useStore.getState().setSchematic(false)}>PLATE</button>
          <button className="m-num" data-on={schematic} onClick={() => useStore.getState().setSchematic(true)}>SCHEMATIC</button>
          <span className="viewbar-sep" />
          <button className="m-num" data-on={motion} onClick={() => useStore.getState().setMotion(!motion)}>MOTION</button>
        </div>

        <AudienceRow />
        <CommitBar />
        <Outcome />
        <HotspotPopup />
      </main>

      <Cascade />
      {!ready && <div className="boot m-num">STARTING KERNEL…</div>}
    </div>
  );
}
