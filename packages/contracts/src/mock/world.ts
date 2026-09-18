/**
 * THE SHARED WORLD SPEC.
 *
 * Renderer-agnostic geometry, generated deterministically from a seed. The
 * kernel simulates against it and the stage renders it, so the reality plate
 * and the twin are registered by construction rather than by hand-alignment.
 * Metres throughout. +X along the quay, +Z inland, +Y up, origin at the
 * western end of the quay edge.
 *
 * Tuas-SHAPED. Not Tuas. Every figure here is synthetic.
 */
import { mulberry32, iso6346, intRange, range } from './rng';

export const TEU = { len: 6.06, width: 2.44, height: 2.59, hcHeight: 2.90 } as const;

export interface WorldBlock {
  id: string;            // '3C'
  x: number; z: number;  // origin corner, metres
  rows: number;          // across X
  bays: number;          // along Z
  maxTier: number;
  rowPitch: number; bayPitch: number; tierPitch: number;
}

export interface WorldCrane { id: string; x: number; }
export interface WorldVessel { id: string; name: string; carrier: string; x: number; length: number; beam: number; }
export interface WorldBox { id: string; block: string; row: number; bay: number; tier: number; hc: boolean; reefer: boolean; target: 'VESSEL' | 'GATE' | 'RAIL' | 'NONE'; }
export interface WorldLane { z: number; }

export interface World {
  seed: number;
  quayLength: number;
  quayDepth: number;      // apron depth, quay edge to first yard
  craneRail: [number, number];
  blocks: WorldBlock[];
  cranes: WorldCrane[];
  vessel: WorldVessel;
  boxes: WorldBox[];
  lanes: WorldLane[];
  gate: { x: number; z: number; lanes: number; pitch: number };
  berths: { id: string; x0: number; x1: number }[];
}

const BLOCK_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export function buildWorld(seed = 20260913): World {
  const r = mulberry32(seed);
  const quayLength = 900;
  const blocks: WorldBlock[] = [];

  // Two ranks of blocks, long axis inland — the automated-terminal layout.
  const rowPitch = 2.9, bayPitch = 6.4, tierPitch = 2.95;
  const rows = 10, bays = 20, maxTier = 6;
  for (let rank = 0; rank < 2; rank++) {
    const z = 150 + rank * 175;
    for (let i = 0; i < 10; i++) {
      const letter = BLOCK_LETTERS[rank * 2 + (i < 5 ? 0 : 1)] as string;
      blocks.push({
        id: `${i + 1}${letter}`,
        x: 40 + i * 84, z, rows, bays, maxTier, rowPitch, bayPitch, tierPitch,
      });
    }
  }

  const cranes: WorldCrane[] = [];
  for (let i = 0; i < 7; i++) cranes.push({ id: `AQC-10${i + 1}`, x: 70 + i * 128 });

  const vessel: WorldVessel = {
    id: 'VSL-KESTREL', name: 'KESTREL SPIRIT', carrier: 'Oracoast Line',
    x: 300, length: 400, beam: 61,
  };

  // ~9,000 boxes, stacked by simulating arrivals rather than sampling positions —
  // a sampled stack does not produce realistic dig depth, and dig depth is the
  // headline number of this edition.
  const boxes: WorldBox[] = [];
  let serial = 100000;
  for (const b of blocks) {
    const fill = range(r, 0.34, 0.52);
    const heights: number[][] = Array.from({ length: b.rows }, () => new Array<number>(b.bays).fill(0));
    const want = Math.floor(b.rows * b.bays * b.maxTier * fill);
    for (let k = 0; k < want; k++) {
      const row = intRange(r, 0, b.rows - 1);
      const bay = intRange(r, 0, b.bays - 1);
      const h = heights[row]![bay]!;
      if (h >= b.maxTier) continue;
      heights[row]![bay] = h + 1;
      const hc = r() < 0.34;
      const reefer = r() < 0.09;
      const roll = r();
      const target: WorldBox['target'] =
        roll < 0.26 ? 'VESSEL' : roll < 0.46 ? 'GATE' : roll < 0.52 ? 'RAIL' : 'NONE';
      boxes.push({
        id: iso6346('MRDU', serial++), block: b.id,
        row, bay, tier: h, hc, reefer, target,
      });
    }
  }

  return {
    seed, quayLength, quayDepth: 120, craneRail: [16, 46],
    blocks, cranes, vessel, boxes,
    lanes: [{ z: 78 }, { z: 92 }, { z: 106 }],
    gate: { x: 760, z: 520, lanes: 12, pitch: 7 },
    berths: [
      { id: 'T1', x0: 0, x1: 300 },
      { id: 'T2', x0: 300, x1: 600 },
      { id: 'T3', x0: 600, x1: 900 },
    ],
  };
}

/** World-space centre of a box, metres. Used by both renderers. */
export function boxCentre(b: WorldBlock, box: WorldBox): [number, number, number] {
  const h = box.hc ? TEU.hcHeight : TEU.height;
  return [
    b.x + (box.row + 0.5) * b.rowPitch,
    box.tier * b.tierPitch + h / 2,
    b.z + (box.bay + 0.5) * b.bayPitch,
  ];
}
