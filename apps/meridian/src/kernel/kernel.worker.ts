/// <reference lib="webworker" />
/**
 * The kernel runs off the render thread from day one — even as a mock — because
 * that boundary is the thing the real kernel has to slot into at G1. The render
 * thread owns NOTHING authoritative; it holds a read-only projection of frames.
 */
import { MockKernel } from '@meridian/contracts/mock';
import type { KernelCommand, KernelFrame } from '@meridian/contracts';

export type ToWorker =
  | { kind: 'init'; seed: number }
  | { kind: 'cmd'; cmd: KernelCommand };

export type FromWorker =
  | { kind: 'ready'; now: number; horizon: [number, number] }
  | { kind: 'frames'; frames: KernelFrame[] };

let kernel: MockKernel | null = null;
let last = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

function tick(): void {
  if (!kernel) return;
  const now = performance.now();
  const dt = last === 0 ? 33 : now - last;
  last = now;
  kernel.step(dt);
  post({ kind: 'frames', frames: kernel.frames() });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.kind === 'init') {
    kernel = new MockKernel({ seed: msg.seed });
    post({ kind: 'ready', now: kernel.now, horizon: kernel.horizon });
    if (timer !== null) clearInterval(timer);
    timer = setInterval(tick, 33);            // 30Hz
    return;
  }
  if (msg.kind === 'cmd' && kernel) {
    kernel.send(msg.cmd);
    tick();
  }
};
