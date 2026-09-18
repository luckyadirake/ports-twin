import { create } from 'zustand';
import type {
  KernelFrame, KernelCommand, LensId, BandThresholds, Role, ScenarioId, PlateId,
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
  setPan(v: number): void;
  revealTo(step: number): void;
  selectScenario(id: ScenarioId): void;
  setDisturbance(v: number): void;
  chooseAdaptation(id: string | null): void;
  setPlate(p: PlateId | 'auto'): void;
}

let worker: Worker | null = null;
const post = (m: ToWorker) => worker?.postMessage(m);

export const useStore = create<State>((set, get) => ({
  frames: [], ready: false, horizon: [0, 1],
  lens: 'operations', playing: true, rate: 1,
  bands: DEFAULT_BANDS, role: null, drawerOpen: false,
  schematic: false, motion: true, hoveredStep: null, activeStep: null, insert: null,
  compareB: false, cascadeOpen: false, revealed: 5, pan: 0.5,

  send(cmd) {
    post({ kind: 'cmd', cmd });
    if (cmd.kind === 'pause') set({ playing: false });
    if (cmd.kind === 'play') set({ playing: true });
    if (cmd.kind === 'setRate') set({ rate: cmd.rate });
    if (cmd.kind === 'setBands') set({ bands: cmd.thresholds });
    if (cmd.kind === 'askPeer') set({ drawerOpen: true });
  },
  setLens(lens) { set({ lens }); get().send({ kind: 'setLens', lens }); },
  setRole: (role) => set({ role }),
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  setSchematic: (schematic) => set({ schematic }),
  setMotion: (motion) => set({ motion }),
  setHovered: (hoveredStep) => set({ hoveredStep }),
  setActive: (activeStep) => set({ activeStep }),
  setRevealed: (revealed: number) => set({ revealed }),
  setInsert: (insert) => set({ insert }),
  selectScenario(id) { get().send({ kind: 'selectScenario', id }); set({ insert: null, hoveredStep: null }); },
  setDisturbance(value) { get().send({ kind: 'setDisturbance', value }); },
  chooseAdaptation(id) { get().send({ kind: 'chooseAdaptation', id }); },
  chooseAdaptationB(id) { get().send({ kind: 'chooseAdaptationB', id }); set({ compareB: id !== null }); },
  setCascadeOpen: (cascadeOpen) => set({ cascadeOpen }),
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
