import { useEffect, useRef, useState } from 'react';
import { PLATES } from '@meridian/contracts';
import { drawAll, panFit, hotspots } from './overlay';
import { useStore, useFrame } from '../store';

/**
 * The plate carries the world; the canvas carries the data. The plate is drawn
 * larger than the frame and the overlay uses the identical transform, so when
 * the console pans to reveal a link the port and the data move together rather
 * than one sliding off the other. The framing is not user-draggable: the pan is
 * the console's, driven by what it is trying to show you.
 */
export function PlateStage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const project = useRef<HTMLDivElement>(null);
  const frame = useFrame();
  const schematic = useStore(s => s.schematic);
  const motion = useStore(s => s.motion);
  const plate = frame?.scenario.plate ?? 'clear';
  const calib = PLATES[plate];
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const cv = canvas.current, box = wrap.current;
      const st = useStore.getState();
      const f = st.frames[0];
      if (cv && box && f) {
        const r = box.getBoundingClientRect();
        const dpr = Math.min(devicePixelRatio, 2);
        const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
        if (cv.width !== w * dpr || cv.height !== h * dpr) {
          cv.width = w * dpr; cv.height = h * dpr;
          cv.style.width = `${w}px`; cv.style.height = `${h}px`;
        }
        const fit = panFit(w, h, st.pan);
        // driven here rather than through React: it moves every frame
        if (project.current) project.current.style.opacity = String(st.previewT);
        // the plate element is positioned by the SAME transform as the overlay
        if (media.current) {
          const m = media.current.style;
          m.left = `${fit.ox}px`; m.top = `${fit.oy}px`;
          m.width = `${fit.sx}px`; m.height = `${fit.sy}px`;
        }
        const ctx = cv.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawAll({
            ctx, w, h, fit, calib: PLATES[f.scenario.plate], frame: f, scen: f.scenario,
            t: performance.now(), schematic: st.schematic,
            hovered: st.hoveredStep, active: st.activeStep, revealed: st.revealed,
            planT: st.planT, previewT: st.previewT, phase: st.solvePhase, seen: st.seenFixed,
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Hit-test the hotspots through the same fit the overlay drew them with. */
  const hitAt = (clientX: number, clientY: number) => {
    const box = wrap.current, f = useStore.getState().frames[0];
    if (!box || !f) return null;
    const r = box.getBoundingClientRect();
    const fit = panFit(r.width, r.height, useStore.getState().pan);
    const px = clientX - r.left, py = clientY - r.top;
    return hotspots(fit, f.scenario.chain, r.width, r.height)
      .find(p => Math.hypot(p.x - px, p.y - py) <= p.r + 6) ?? null;
  };

  const onMove = (e: React.PointerEvent) => {
    const hit = hitAt(e.clientX, e.clientY);
    useStore.getState().setHovered(hit ? hit.i : null);
  };
  const onUp = (e: React.PointerEvent) => {
    const st = useStore.getState();
    const hit = hitAt(e.clientX, e.clientY);
    st.setActive(hit ? (st.activeStep === hit.i ? null : hit.i) : null);
  };

  const vis = frame?.scenario.weather.visibility ?? 1;

  return (
    <div
      className="plate" ref={wrap}
      onPointerMove={onMove} onPointerUp={onUp}
      onPointerLeave={() => useStore.getState().setHovered(null)}
    >
      {/* The still is always the base layer, so the frame is never empty while
          the loop buffers; motion simply plays on top of it. */}
      <div className="plate-media" ref={media}>
        {!schematic && (
          <img key={calib.still} src={calib.still} alt="" draggable={false} onLoad={() => setLoaded(true)} />
        )}
        {!schematic && motion && (
          <video key={calib.loop} src={calib.loop} autoPlay muted loop playsInline preload="auto" />
        )}
      </div>

      {!schematic && (
        <div
          className="plate-grade" style={{ opacity: 1 - vis,
            background: 'linear-gradient(180deg, rgba(14,32,46,.92) 0%, rgba(12,26,38,.66) 42%, rgba(8,18,26,.5) 100%)' }}
        />
      )}
      <div className="plate-vignette" />
      {/* the world steps back while the twin draws on top of it */}
      <div className="plate-project" ref={project} />
      <canvas ref={canvas} className="plate-canvas" />
      {!loaded && !schematic && <div className="plate-loading m-num">LOADING PLATE…</div>}
      <span className="plate-tag m-num">
        {schematic ? 'SCHEMATIC' : `PLATE · ${calib.label.toUpperCase()}`}
        {!schematic && motion ? ' · MOTION' : ''}
      </span>
    </div>
  );
}
