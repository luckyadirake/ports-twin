/**
 * THE DATA LAYER.
 *
 * One set of drawing routines, positioned entirely through the plate
 * calibration, rendered over either the photographic plate or a dark ground.
 * That is what makes the schematic view genuinely the same view: same
 * calibration, same geometry, different background.
 */
import type { PlateCalib, ScenarioState, KernelFrame } from '@meridian/contracts';
import { apron, yardPoint, yardBlockQuad } from '@meridian/contracts';
import { heat } from '@meridian/ui';

/**
 * The plate is drawn with object-fit: cover, so the visible image is a CROP of
 * the source frame. Calibration is in source-frame coordinates, so every point
 * must go through this fit or the overlay sits in the wrong place — which is
 * exactly the registration failure the plate kit warned about.
 */
export const PLATE_ASPECT = 16 / 9;

export interface Fit { sx: number; sy: number; ox: number; oy: number }

/** How much bigger than the frame we draw the plate, to leave room to pan. */
export const PLATE_ZOOM = 1.22;

/**
 * The plate is drawn larger than the frame so the operator can drag along the
 * quay. The overlay uses the identical transform, so panning never breaks
 * registration — the data moves with the port because it is the same maths.
 */
export function panFit(w: number, h: number, pan: number, zoom = PLATE_ZOOM): Fit {
  const b = coverFit(w, h);
  const sx = b.sx * zoom, sy = b.sy * zoom;
  // anchor low: the yard in the foreground is where most of the data sits
  return { sx, sy, ox: b.ox - (sx - b.sx) * pan, oy: b.oy - (sy - b.sy) * 0.88 };
}

export function coverFit(w: number, h: number, aspect = PLATE_ASPECT): Fit {
  const hByW = w / aspect;
  if (hByW >= h) return { sx: w, sy: hByW, ox: 0, oy: (h - hByW) / 2 };
  const wByH = h * aspect;
  return { sx: wByH, sy: h, ox: (w - wByH) / 2, oy: 0 };
}

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  w: number; h: number;
  fit: Fit;
  calib: PlateCalib;
  frame: KernelFrame;
  scen: ScenarioState;
  t: number;              // ms, for animation
  schematic: boolean;
  hovered: number | null; // chain step index
  active: number | null;  // the opened hotspot
  revealed: number;       // how many cascade links have fired
}

/** Screen position of every chain hotspot, for drawing AND for hit-testing. */
export interface Hotspot {
  i: number; x: number; y: number; r: number;
  /** where the link actually is, before the safe area moved the puck */
  tx: number; ty: number; off: boolean;
}

/**
 * The glass rails sit over the left and right fifths of the stage, so a link
 * anchored out there gets a puck nobody can see or click. Rather than move the
 * anchors — they are where the thing is happening — the puck is pulled into the
 * readable band and a leader line is left pointing back at the truth.
 */
export function hotspots(
  fit: Fit, chain: readonly { anchor?: readonly [number, number] }[],
  w = 0, h = 0,
): Hotspot[] {
  const out: Hotspot[] = [];
  const rail = Math.min(306, w * 0.22);
  const L = w ? rail + 26 : -Infinity, R = w ? w - rail - 26 : Infinity;
  const T = h ? 128 : -Infinity, B = h ? h - 30 : Infinity;
  chain.forEach((s, i) => {
    if (!s.anchor) return;
    const tx = fit.ox + s.anchor[0] * fit.sx, ty = fit.oy + s.anchor[1] * fit.sy;
    const x = Math.min(R, Math.max(L, tx)), y = Math.min(B, Math.max(T, ty));
    out.push({ i, x, y, r: 15, tx, ty, off: Math.hypot(x - tx, y - ty) > 2 });
  });
  return out;
}

const CYAN = '#3FD9EC', MINT = '#45E0B0', AMBER = '#FF9A3C', RED = '#FF5747';
const SEV = { ok: MINT, watch: AMBER, alarm: RED } as const;

/** source-frame normalised → screen pixels, through the cover crop */
const P = (d: DrawCtx, p: readonly [number, number]): [number, number] =>
  [d.fit.ox + p[0] * d.fit.sx, d.fit.oy + p[1] * d.fit.sy];
/** a bare y in source-frame normalised → screen */
const PY = (d: DrawCtx, v: number): number => d.fit.oy + v * d.fit.sy;
const PX = (d: DrawCtx, u: number): number => d.fit.ox + u * d.fit.sx;

function line(d: DrawCtx, a: [number, number], b: [number, number], color: string, width = 1, dash: number[] = []) {
  const c = d.ctx;
  c.save(); c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash);
  c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.restore();
}

function label(d: DrawCtx, text: string, x: number, y: number, color: string, size = 10, align: CanvasTextAlign = 'left') {
  const c = d.ctx;
  c.save();
  c.font = `600 ${size}px "IBM Plex Mono", monospace`;
  c.textAlign = align; c.textBaseline = 'middle';
  const wdt = c.measureText(text).width;
  const px = align === 'center' ? x - wdt / 2 - 5 : align === 'right' ? x - wdt - 5 : x - 5;
  c.fillStyle = 'rgba(4,10,16,.72)';
  c.fillRect(px, y - size * 0.8, wdt + 10, size * 1.6);
  c.strokeStyle = 'rgba(124,196,214,.22)'; c.lineWidth = 1;
  c.strokeRect(px, y - size * 0.8, wdt + 10, size * 1.6);
  c.fillStyle = color; c.fillText(text, x, y);
  c.restore();
}

/* ------------------------------------------------------------ background -- */
export function drawSchematicGround(d: DrawCtx) {
  const { ctx: c, w, h, calib: k } = d;
  const g = c.createLinearGradient(0, PY(d, 0), 0, PY(d, 1));
  g.addColorStop(0, '#05141d'); g.addColorStop(k.horizonY, '#06222e');
  g.addColorStop(k.quayY, '#04121a'); g.addColorStop(1, '#040c12');
  c.fillStyle = g; c.fillRect(0, 0, w, h);

  // sea hatch
  c.save(); c.strokeStyle = 'rgba(63,217,236,.07)'; c.lineWidth = 1;
  for (let y = PY(d, k.horizonY); y < PY(d, k.quayY); y += 7) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
  }
  c.restore();

  // yard grid
  c.save(); c.strokeStyle = 'rgba(63,217,236,.12)'; c.lineWidth = 1;
  for (let i = 0; i <= 20; i++) {
    const a = P(d, yardPoint(k, i / 20, 0)), b = P(d, yardPoint(k, i / 20, 1));
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  }
  for (let j = 0; j <= 6; j++) {
    const a = P(d, yardPoint(k, 0, j / 6)), b = P(d, yardPoint(k, 1, j / 6));
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  }
  c.restore();
}

/* ------------------------------------------------------------------ quay -- */
export function drawQuay(d: DrawCtx) {
  const { calib: k, frame } = d;
  line(d, P(d, [0, k.quayY]), P(d, [1, k.quayY]), 'rgba(63,217,236,.5)', 1.4, [7, 5]);

  for (const b of k.berths) {
    const y = PY(d, k.railY);
    const x0 = PX(d, b.x0), x1 = PX(d, b.x1);
    const occupied = b.id === 'T2';
    const col = occupied ? CYAN : 'rgba(148,173,184,.55)';
    d.ctx.save();
    d.ctx.strokeStyle = col; d.ctx.lineWidth = occupied ? 2 : 1;
    d.ctx.beginPath();
    d.ctx.moveTo(x0 + 4, y - 7); d.ctx.lineTo(x0 + 4, y); d.ctx.lineTo(x1 - 4, y); d.ctx.lineTo(x1 - 4, y - 7);
    d.ctx.stroke();
    if (occupied) {
      d.ctx.fillStyle = 'rgba(63,217,236,.10)';
      d.ctx.fillRect(x0 + 4, y - 7, x1 - x0 - 8, 7);
    }
    d.ctx.restore();
    label(d, occupied ? `${b.id} · KESTREL SPIRIT` : b.id, (x0 + x1) / 2, y + 11, occupied ? CYAN : 'rgba(148,173,184,.8)', 9.5, 'center');
  }
  void frame;
}

/* ---------------------------------------------------------------- cranes -- */
export function drawCranes(d: DrawCtx) {
  const { calib: k, frame, scen } = d;
  const rate = scen.comparison.chosen
    ? scen.comparison.adapted.movesPerHour.value
    : scen.comparison.baseline.movesPerHour.value;
  const nominal = 32;
  const deg = rate / nominal;

  k.craneX.forEach((cx, i) => {
    const x = PX(d, cx), y = PY(d, k.railY);
    const health = frame.assets[i];
    const hot = health ? health.windingTempC > health.envelope.tempC : false;
    const col = hot ? RED : deg < 0.7 ? AMBER : CYAN;

    // bracket around the crane base
    const c = d.ctx;
    c.save();
    c.strokeStyle = col; c.lineWidth = 1.4;
    const bw = Math.max(15, d.fit.sx * 0.016), bh = 13;
    c.beginPath();
    c.moveTo(x - bw, y - bh); c.lineTo(x - bw, y + 4); c.lineTo(x - bw + 6, y + 4);
    c.moveTo(x + bw, y - bh); c.lineTo(x + bw, y + 4); c.lineTo(x + bw - 6, y + 4);
    c.stroke();

    // sway arc — only when the model says the load is swinging
    const amp = scen.id === 'monsoon-sway' ? Math.min(1, (scen.weather.windKt - 12) / 45) : 0;
    if (amp > 0.02) {
      const swing = Math.sin(d.t / 1400 + i * 0.8) * amp * bw * 1.5;
      const ty = y - bh - 26;
      c.strokeStyle = 'rgba(255,87,71,.5)'; c.lineWidth = 1;
      c.beginPath(); c.arc(x, ty, amp * bw * 1.5, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      c.strokeStyle = RED; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x, ty); c.lineTo(x + swing, ty + 18); c.stroke();
      c.fillStyle = RED; c.fillRect(x + swing - 4, ty + 18, 8, 5);
    }
    c.restore();

    if (i === 3 || d.schematic) {
      label(d, `AQC-10${i + 1} · ${(rate).toFixed(0)}`, x, y - bh - (amp > 0.02 ? 44 : 12), col, 9, 'center');
    }
  });
}

/* ------------------------------------------------------------ yard + AGV -- */
export function drawYard(d: DrawCtx) {
  const { calib: k, scen } = d;
  const c = d.ctx;
  const BLOCKS = 9;
  const digHot = scen.id === 'vessel-delay' ? Math.min(1, scen.disturbance.value / 20) : 0.18;

  for (let i = 0; i < BLOCKS; i++) {
    const u0 = i / BLOCKS + 0.012, u1 = (i + 1) / BLOCKS - 0.012;
    const q = yardBlockQuad(k, u0, u1, 0.04, 0.94).map(p => P(d, p));
    const isTarget = i === 2;
    const t = isTarget ? digHot : 0.10 + digHot * 0.30;
    c.save();
    c.beginPath();
    c.moveTo(q[0]![0], q[0]![1]);
    for (let j = 1; j < q.length; j++) c.lineTo(q[j]![0], q[j]![1]);
    c.closePath();
    c.fillStyle = d.schematic
      ? `rgba(63,217,236,${0.05 + t * 0.30})`
      : `${heat(t)}${Math.round((0.10 + t * 0.30) * 255).toString(16).padStart(2, '0')}`;
    c.fill();
    c.strokeStyle = isTarget ? 'rgba(255,154,60,.75)' : 'rgba(63,217,236,.22)';
    c.lineWidth = isTarget ? 1.6 : 1;
    c.stroke();
    c.restore();
    if (isTarget) {
      const mid = P(d, yardPoint(k, (u0 + u1) / 2, 0.42));
      label(d, `3C · dig ${Math.round(1340 * (0.5 + digHot))}`, mid[0], mid[1], AMBER, 9.5, 'center');
    }
  }

  // AGV lanes on the apron, with vehicles moving at the modelled rate
  const lanes = [0.3, 0.55, 0.8];
  const pool = scen.id === 'agv-reroute' ? 18 - scen.disturbance.value : 18;
  lanes.forEach((lv, li) => {
    const a = P(d, apron(k, 0, lv)), b = P(d, apron(k, 1, lv));
    line(d, a, b, d.schematic ? 'rgba(69,224,176,.28)' : 'rgba(69,224,176,.22)', 1, [3, 6]);
    const n = Math.max(1, Math.round(pool / 3));
    for (let i = 0; i < n; i++) {
      const u = ((d.t / 26000) * (li % 2 ? -1 : 1) + i / n + li * 0.11 + 1) % 1;
      const p = P(d, apron(k, u, lv));
      c.save();
      c.fillStyle = MINT; c.shadowColor = MINT; c.shadowBlur = 6;
      c.fillRect(p[0] - 3, p[1] - 1.6, 6, 3.2);
      c.restore();
    }
  });
}

/* -------------------------------------------------------------- hotspots -- */
/**
 * Every link in the chain gets a numbered hotspot where it is happening on the
 * port. They are all visible at once and they fire in cascade order, so you can
 * see the disturbance travel across the terminal instead of clicking a list.
 */
export function drawHotspots(d: DrawCtx) {
  const c = d.ctx;
  const pts = hotspots(d.fit, d.scen.chain, d.w, d.h);
  pts.forEach(({ i, x, y, tx, ty, off }) => {
    const step = d.scen.chain[i]!;
    const col = SEV[step.severity];
    const on = i < d.revealed;
    const hot = d.hovered === i || d.active === i;
    const age = d.revealed > i ? 1 : 0;

    c.save();
    c.globalAlpha = on ? 1 : 0.18;

    // pulled in from under a rail — say so rather than pretend
    if (off) {
      c.save();
      c.globalAlpha = (on ? 1 : 0.18) * 0.5;
      c.strokeStyle = col; c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(x, y); c.lineTo(tx, ty); c.stroke();
      c.beginPath(); c.arc(tx, ty, 2.4, 0, Math.PI * 2); c.fillStyle = col; c.fill();
      c.restore();
    }

    // the firing ring — expands once as the link lands
    if (on && age) {
      const ph = ((d.t / 1700) + i * 0.21) % 1;
      c.strokeStyle = col; c.globalAlpha = (on ? 1 : 0.2) * (1 - ph) * 0.55; c.lineWidth = 1.4;
      c.beginPath(); c.arc(x, y, 13 + ph * 22, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = on ? 1 : 0.18;
    }

    // puck
    c.beginPath(); c.arc(x, y, hot ? 14 : 11.5, 0, Math.PI * 2);
    c.fillStyle = 'rgba(4,10,16,.82)'; c.fill();
    c.strokeStyle = col; c.lineWidth = hot ? 2.2 : 1.6; c.stroke();

    // number
    c.fillStyle = col;
    c.font = `700 ${hot ? 12 : 11}px "IBM Plex Mono", monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(i + 1), x, y + 0.5);

    // on hover, name it on the plate
    if (hot) {
      const dx = x > d.w * 0.55 ? -1 : 1;
      c.strokeStyle = col; c.lineWidth = 1; c.globalAlpha = 0.8;
      c.beginPath(); c.moveTo(x + dx * 15, y); c.lineTo(x + dx * 44, y - 24); c.stroke();
      c.globalAlpha = 1;
      label(d, step.short, x + dx * 48, y - 24, col, 10, dx > 0 ? 'left' : 'right');
    }
    c.restore();
  });
}

/* ------------------------------------------------------------- weather ---- */
export function drawWeather(d: DrawCtx) {
  const { scen, ctx: c, w, h } = d;
  const { rain, windKt } = scen.weather;
  if (rain <= 0.02) return;
  const drops = Math.round(rain * 420);
  const lean = Math.min(0.65, windKt / 90);
  c.save();
  c.strokeStyle = `rgba(200,225,235,${0.10 + rain * 0.22})`;
  c.lineWidth = 1;
  for (let i = 0; i < drops; i++) {
    const seed = i * 9301 + 49297;
    const x0 = ((seed % 233280) / 233280) * w;
    const speed = 900 + (i % 7) * 160;
    const y0 = ((d.t * speed / 1000 + (seed % 977) * 7) % (h + 120)) - 60;
    const len = 14 + (i % 5) * 7;
    c.beginPath();
    c.moveTo(x0, y0); c.lineTo(x0 - len * lean, y0 + len);
    c.stroke();
  }
  c.restore();
}

/* ---------------------------------------------------------------- driver -- */
export function drawAll(d: DrawCtx) {
  d.ctx.clearRect(0, 0, d.w, d.h);
  if (d.schematic) drawSchematicGround(d);
  drawYard(d);
  drawQuay(d);
  drawCranes(d);
  drawHotspots(d);
  if (!d.schematic) drawWeather(d);

  // scan sweep — the only purely decorative element, and it earns its place by
  // telling you the model is still running
  const sx = ((d.t / 9000) % 1) * d.w;
  const g = d.ctx.createLinearGradient(sx - 90, 0, sx, 0);
  g.addColorStop(0, 'rgba(63,217,236,0)'); g.addColorStop(1, 'rgba(63,217,236,.07)');
  d.ctx.fillStyle = g; d.ctx.fillRect(sx - 90, 0, 90, d.h);
}
