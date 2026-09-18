import { create } from 'zustand';
import type {
  KernelFrame, KernelCommand, LensId, BandThresholds, Role, ScenarioId, PlateId, SolvePhase,
} from '@meridian/contracts';
import { DEFAULT_BANDS } from '@meridian/contracts';
import type { ToWorker, FromWorker } from './kernel/kernel.worker';

export interface InsertClip { src: string; label: string }

interface State {
  frames: KernelFrame[];
  ready: boolean;
  horizon: [number, number];
  lens: LensId;
  playing: boolean;
  rate: number;
  bands: BandThresholds;
  role: Role | null;
  drawerOpen: boolean;
  schematic: boolean;
  motion: boolean;
  hoveredStep: number | null;
  activeStep: number | null;
  insert: InsertClip | null;
  compareB: boolean;
  cascadeOpen: boolean;
  /** which beat of the agent run is on screen */
  solvePhase: SolvePhase;
  /** 0 → 1 as the stage eases from the do-nothing state onto the committed plan */
  planT: number;
  /** the plan being projected over the port but not yet owned */
  previewId: string | null;
  /** 0 → 1 as the projection fades up over the plate */
  previewT: number;
  pan: number;
  revealed: number;

  send(cmd: KernelCommand): void;
  setLens(l: LensId): void;
  setRole(r: Role | null): void;
  setDrawer(v: boolean): void;
  setSchematic(v: boolean): void;
  setMotion(v: boolean): void;
  setHovered(i: number | null): void;
  setActive(i: number | null): void;
  setRevealed(n: number): void;
  setInsert(c: InsertClip | null): void;
  chooseAdaptationB(id: string | null): void;
  setCompareB(v: boolean): void;
  setCascadeOpen(v: boolean): void;
  runSolve(): void;
  preview(id: string | null): void;
  commit(id: string): void;
  setPan(v: number): void;
  revealTo(step: number): void;
  selectScenario(id: ScenarioId): void;
  setDisturbance(v: number): void;
  chooseAdaptation(id: string | null): void;
  setPlate(p: PlateId | 'auto'): void;
}

let worker: Worker | null = null;
const post = (m: ToWorker) => worker?.postMessage(m);

let timers: ReturnType<typeof setTimeout>[] = [];
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

export const useStore = create<State>((set, get) => ({
  frames: [], ready: false, horizon: [0, 1],
  lens: 'operations', playing: true, rate: 1,
  bands: DEFAULT_BANDS, role: null, drawerOpen: false,
  schematic: false, motion: true, hoveredStep: null, activeStep: null, insert: null,
  compareB: false, cascadeOpen: false, solvePhase: 'idle', planT: 0,
  previewId: null, previewT: 0,
  revealed: 5, pan: 0.5,

  send(cmd) {
    post({ kind: 'cmd', cmd });
    if (cmd.kind === 'pause') set({ playing: false });
    if (cmd.kind === 'play') set({ playing: true });
    if (cmd.kind === 'setRate') set({ rate: cmd.rate });
    if (cmd.kind === 'setBands') set({ bands: cmd.thresholds });
    if (cmd.kind === 'askPeer') set({ drawerOpen: true });
  },
  setLens(lens) {
    set({ lens });
    get().send({ kind: 'setLens', lens });
    get().runSolve();                 // a different currency, a different ranking
  },
  setRole: (role) => set({ role }),
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  setSchematic: (schematic) => set({ schematic }),
  setMotion: (motion) => set({ motion }),
  setHovered: (hoveredStep) => set({ hoveredStep }),
  setActive: (activeStep) => set({ activeStep }),
  setRevealed: (revealed: number) => set({ revealed }),
  setInsert: (insert) => set({ insert }),
  selectScenario(id) {
    get().send({ kind: 'selectScenario', id });
    set({ insert: null, hoveredStep: null, planT: 0, previewId: null, previewT: 0 });
    post({ kind: 'cmd', cmd: { kind: 'previewAdaptation', id: null } });
    get().runSolve();
  },
  setDisturbance(value) { get().send({ kind: 'setDisturbance', value }); },
  chooseAdaptation(id) { get().send({ kind: 'chooseAdaptation', id }); },
  chooseAdaptationB(id) { get().send({ kind: 'chooseAdaptationB', id }); set({ compareB: id !== null }); },
  setCascadeOpen: (cascadeOpen) => set({ cascadeOpen }),

  /**
   * Beats 1–3. The search itself is already done — the kernel recomputes it on
   * every frame — so these timings pace a reveal rather than fake a wait. The
   * counts and the rejections on screen are the real ones.
   */
  runSolve() {
    clearTimers();
    set({ solvePhase: 'brief' });
    timers.push(setTimeout(() => set({ solvePhase: 'solve' }), 380));
    timers.push(setTimeout(() => set({ solvePhase: 'arbitrate' }), 1620));
    timers.push(setTimeout(() => set({ solvePhase: 'idle' }), 2500));
  },

  /**
   * Beat 4, on its own. Selecting a plan does NOT commit it — it asks the
   * agents to run it and projects the answer over the port. Nothing about the
   * terminal has changed; the operator is being shown a future, and the visual
   * language has to say so.
   */
  preview(id) {
    clearTimers();
    post({ kind: 'cmd', cmd: { kind: 'previewAdaptation', id } });
    if (id === null) {
      set({ previewId: null, previewT: 0, solvePhase: 'idle' });
      return;
    }
    set({ previewId: id, previewT: 0, solvePhase: 'simulate' });
    const t0 = performance.now(), dur = 620;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      set({ previewT: 1 - Math.pow(1 - k, 3) });
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  /**
   * Beats 5–6. Commit the plan first so the models recompute, THEN let the
   * cascade retell itself and the stage ease onto the new state — in that
   * order, so nothing on screen moves before the number behind it does.
   */
  commit(id) {
    clearTimers();
    const st = get();
    if (st.frames[0]?.scenario.comparison.chosen === id) {   // un-commit
      st.chooseAdaptation(null);
      post({ kind: 'cmd', cmd: { kind: 'previewAdaptation', id: null } });
      set({ solvePhase: 'idle', planT: 0, previewId: null, previewT: 0 });
      return;
    }
    st.chooseAdaptation(id);
    post({ kind: 'cmd', cmd: { kind: 'previewAdaptation', id: null } });
    set({ solvePhase: 'simulate', planT: 0, previewId: null, previewT: 0, revealed: 0 });
    const links = st.frames[0]?.scenario.chain.length ?? 5;
    for (let i = 0; i < links; i++) {
      timers.push(setTimeout(() => set({ revealed: i + 1 }), 120 + i * (1100 / links)));
    }
    timers.push(setTimeout(() => {
      set({ solvePhase: 'render' });
      const t0 = performance.now(), dur = 900;
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        set({ planT: 1 - Math.pow(1 - k, 3) });
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 1300));
    timers.push(setTimeout(() => set({ solvePhase: 'report' }), 2300));
  },
  setCompareB(compareB) { set({ compareB }); if (!compareB) get().send({ kind: 'chooseAdaptationB', id: null }); },
  setPan(pan) { set({ pan: Math.min(1, Math.max(0, pan)) }); },
  /** Pan the port until the hotspot for this link is comfortably in frame. */
  revealTo(step) {
    const f = get().frames[0];
    const a = f?.scenario.chain[step]?.anchor;
    if (!a) return;
    const want = Math.min(1, Math.max(0, (a[0] - 0.22) / 0.56));
    const from = get().pan;
    if (Math.abs(want - from) < 0.02) return;
    const t0 = performance.now(), dur = 520;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      set({ pan: from + (want - from) * e });
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  setPlate(plate) { get().send({ kind: 'setPlate', plate }); },
}));

export function startKernel(): () => void {
  worker = new Worker(new URL('./kernel/kernel.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.kind === 'ready') useStore.setState({ ready: true, horizon: m.horizon });
    else useStore.setState({ frames: m.frames });
  };
  post({ kind: 'init', seed: 20260913 });
  return () => { worker?.terminate(); worker = null; };
}

export const useFrame = () => useStore(s => s.frames[0]);
