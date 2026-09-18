/**
 * PLATE CALIBRATION.
 *
 * The plates are photographs, the simulation is metric. These landmarks are the
 * bridge: measured once per plate, in normalised frame coordinates (0..1), and
 * everything the overlay draws is positioned against them.
 *
 * Each weather state carries its OWN calibration, because the generated plates
 * are not pixel-identical to each other. That is why switching weather also
 * switches calibration, and why the overlay stays put when it does.
 */
export type PlateId = 'clear' | 'monsoon' | 'night' | 'predawn';

export interface PlateCalib {
  readonly id: PlateId;
  readonly label: string;
  readonly still: string;
  readonly loop: string;
  /** y of the sea horizon */
  readonly horizonY: number;
  /** y where the water meets the quay wall */
  readonly quayY: number;
  /** y where the apron ends and the yard begins */
  readonly yardY: number;
  /** x of each quay crane portal centre, west to east */
  readonly craneX: readonly number[];
  /** y of the crane rail (where the portal legs meet the apron) */
  readonly railY: number;
  readonly berths: readonly { readonly id: string; readonly x0: number; readonly x1: number }[];
  readonly vessel: { readonly x0: number; readonly x1: number; readonly y: number };
  /** the yard as a perspective quad: x at the far edge, x at the near edge */
  readonly yard: { readonly farL: number; readonly farR: number; readonly nearL: number; readonly nearR: number };
  /** ambient grade the overlay should assume, so chip colours stay legible */
  readonly dark: boolean;
}

const BERTHS = [
  { id: 'T1', x0: 0.03, x1: 0.44 },
  { id: 'T2', x0: 0.44, x1: 0.82 },
  { id: 'T3', x0: 0.82, x1: 0.99 },
] as const;

export const PLATES: Record<PlateId, PlateCalib> = {
  clear: {
    id: 'clear', label: 'Clear', still: 'plates/clear.jpg', loop: 'plates/clear.mp4',
    horizonY: 0.354, quayY: 0.600, yardY: 0.667, railY: 0.612,
    craneX: [0.117, 0.293, 0.380, 0.578, 0.670, 0.742, 0.898],
    berths: BERTHS, vessel: { x0: 0.484, x1: 0.805, y: 0.578 },
    yard: { farL: 0.00, farR: 1.00, nearL: -0.06, nearR: 1.06 },
    dark: false,
  },
  monsoon: {
    id: 'monsoon', label: 'Monsoon', still: 'plates/monsoon.jpg', loop: 'plates/monsoon.mp4',
    horizonY: 0.355, quayY: 0.613, yardY: 0.657, railY: 0.622,
    craneX: [0.130, 0.290, 0.380, 0.575, 0.665, 0.745, 0.895],
    berths: BERTHS, vessel: { x0: 0.490, x1: 0.800, y: 0.590 },
    yard: { farL: 0.00, farR: 1.00, nearL: -0.05, nearR: 1.05 },
    dark: true,
  },
  night: {
    id: 'night', label: 'Night', still: 'plates/night.jpg', loop: 'plates/night.mp4',
    horizonY: 0.330, quayY: 0.606, yardY: 0.654, railY: 0.616,
    craneX: [0.118, 0.291, 0.382, 0.577, 0.664, 0.745, 0.891],
    berths: BERTHS, vessel: { x0: 0.486, x1: 0.800, y: 0.584 },
    yard: { farL: 0.00, farR: 1.00, nearL: -0.05, nearR: 1.05 },
    dark: true,
  },
  predawn: {
    id: 'predawn', label: 'Pre-dawn', still: 'plates/predawn.jpg', loop: 'plates/predawn.mp4',
    horizonY: 0.348, quayY: 0.604, yardY: 0.662, railY: 0.614,
    craneX: [0.120, 0.292, 0.381, 0.577, 0.667, 0.743, 0.895],
    berths: BERTHS, vessel: { x0: 0.485, x1: 0.802, y: 0.582 },
    yard: { farL: 0.00, farR: 1.00, nearL: -0.06, nearR: 1.06 },
    dark: true,
  },
};

/** A point on the apron. u = along the quay 0..1, t = 0 at the quay edge, 1 at the yard. */
export function apron(c: PlateCalib, u: number, t: number): readonly [number, number] {
  const y = c.quayY + (c.yardY - c.quayY) * t;
  // the apron widens slightly toward the camera
  const spread = 1 + 0.045 * t;
  return [0.5 + (u - 0.5) * spread, y];
}

/** A point in the yard. u = along the quay 0..1, v = 0 at the far edge, 1 at the frame bottom. */
export function yardPoint(c: PlateCalib, u: number, v: number): readonly [number, number] {
  const y = c.yardY + (1 - c.yardY) * v;
  const l = c.yard.farL + (c.yard.nearL - c.yard.farL) * v;
  const r = c.yard.farR + (c.yard.nearR - c.yard.farR) * v;
  return [l + (r - l) * u, y];
}

/** The four screen corners of one yard block, for a translucent quad. */
export function yardBlockQuad(
  c: PlateCalib, u0: number, u1: number, v0: number, v1: number,
): readonly (readonly [number, number])[] {
  return [
    yardPoint(c, u0, v0), yardPoint(c, u1, v0),
    yardPoint(c, u1, v1), yardPoint(c, u0, v1),
  ];
}
