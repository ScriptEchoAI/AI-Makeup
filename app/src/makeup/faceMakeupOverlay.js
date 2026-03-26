import { drawVideoCover, mapNormToCanvas, OUTER_LIP_PATH } from '../lips/lipLandmarker.js';
import { classifyFaceShape, SHAPE_LABELS } from './faceShape.js';
import { resolveMakeupPack } from './makeupPacks.js';
import { analyzeSkinTone, mergeSkinHistory, sampleFaceBaseRgb } from './skinTone.js';
import { classifyEyeShape, mergeEyeHistory } from './eyeShape.js';

/** @param {number[]} a @param {number[]} b @param {number} t */
function mixLipRgb(a, b, t) {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
}

/** 左眉（内→外）、右眉（内→外） */
const LEFT_BROW = [70, 63, 105, 66, 107];
const RIGHT_BROW = [300, 293, 334, 296, 336];

/** Face Landmarker 脸部外轮廓（与 Face Mesh face oval 一致），用于底妆 clip */
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

/**
 * @param {{ video: HTMLVideoElement, canvas: HTMLCanvasElement, landmarker: import('@mediapipe/tasks-vision').FaceLandmarker, getLookTuning: () => { alphaScale: number, lipAlpha: number, vividMul: number, blushMul: number, contourMul: number, browMul: number, highlightMul: number, foundationMul?: number, lipRgbMix: [number,number,number], lipRgbMixT: number, blushRgbMix: [number,number,number], blushRgbMixT: number, browRgbMix: [number,number,number], browRgbMixT: number, browThicknessMul: number, browLiftExtra: number, contourLineWidthMul: number, blushRadiusMul: number, highlightRadiusMul: number, strengthMul: number }, getOccasion: () => string | null, getRelation: () => string | null, onFaceState?: (ok: boolean) => void, onAnalysis?: (a: { shapeKey: string, label: string, pack: ReturnType<typeof resolveMakeupPack>, skin: ReturnType<typeof mergeSkinHistory>, eye: ReturnType<typeof mergeEyeHistory> } | null) => void }} p
 */
export function startFaceMakeupOverlay({
  video,
  canvas,
  landmarker,
  getLookTuning,
  getOccasion,
  getRelation,
  onFaceState,
  onAnalysis,
}) {
  const ctx = canvas.getContext('2d');
  /** 画布已绘制视频帧时隐藏底层 video，避免重影 */
  function setVideoUnderlayVisible(show) {
    if (!video) return;
    if (show) {
      video.classList.remove('opacity-0');
      video.classList.add('opacity-100');
    } else {
      video.classList.add('opacity-0');
      video.classList.remove('opacity-100');
    }
  }
  let raf = 0;
  let stopped = false;
  let lastFace = false;
  const shapeHistory = [];
  const skinHistory = [];
  const eyeHistory = [];
  let lastReportSig = null;
  let lastScheduledSig = null;
  let reportTimer = 0;
  /** 每帧更新，供防抖回调读取最新脸型 */
  let latestStable = 'oval';

  function smoothShape(key) {
    shapeHistory.push(key);
    if (shapeHistory.length > 10) shapeHistory.shift();
    const counts = {};
    for (const s of shapeHistory) counts[s] = (counts[s] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  function eyeDist(face) {
    const a = face[33];
    const b = face[263];
    if (!a || !b) return 0.2;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function tick() {
    if (stopped) return;
    const w = video.clientWidth;
    const h = video.clientHeight;
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
    }

    if (video.readyState >= 2 && landmarker && canvas.width && canvas.height) {
      const res = landmarker.detectForVideo(video, performance.now());
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const face = res.faceLandmarks?.[0];
      const videoOk = !!(video.videoWidth && video.videoHeight);

      if (face && videoOk) {
        drawVideoCover(ctx, video, canvas);
        setVideoUnderlayVisible(false);
      } else {
        setVideoUnderlayVisible(true);
      }

      if (face) {
        const { shape: shapeKey } = classifyFaceShape(face);
        const stable = smoothShape(shapeKey);
        latestStable = stable;
        const occ = getOccasion() || 'daily';
        const rel = getRelation() || 'self';

        const skinSnap = analyzeSkinTone(video, face);
        if (skinSnap) {
          skinHistory.push(skinSnap);
          if (skinHistory.length > 8) skinHistory.shift();
        }
        const eyeSnap = classifyEyeShape(face);
        if (eyeSnap) {
          eyeHistory.push(eyeSnap);
          if (eyeHistory.length > 8) eyeHistory.shift();
        }
        const mergedSkin = mergeSkinHistory(skinHistory);
        const mergedEye = mergeEyeHistory(eyeHistory);

        const pack = resolveMakeupPack(stable, occ, rel, mergedSkin || undefined, mergedEye || undefined);
        const look = getLookTuning();
        const str = look.strengthMul ?? 1;

        const sig = `${stable}|${mergedSkin?.label || '-'}|${mergedEye?.label || '-'}`;
        if (sig !== lastScheduledSig) {
          lastScheduledSig = sig;
          clearTimeout(reportTimer);
          reportTimer = setTimeout(() => {
            const o = getOccasion() || 'daily';
            const r = getRelation() || 'self';
            const ms = mergeSkinHistory(skinHistory);
            const me = mergeEyeHistory(eyeHistory);
            const sk = latestStable;
            const p = resolveMakeupPack(sk, o, r, ms || undefined, me || undefined);
            lastReportSig = sig;
            onAnalysis?.({ shapeKey: sk, label: SHAPE_LABELS[sk], pack: p, skin: ms, eye: me });
          }, 450);
        }

        const ed = eyeDist(face);
        const blushProf = pack.blushProfile;
        const blushR =
          Math.min(50, Math.max(11, ed * canvas.width * 0.28)) *
          (blushProf?.radiusMul ?? 1) *
          (look.blushRadiusMul ?? 1);

        const vividEff = Math.min(1.22, pack.vivid * look.vividMul);
        const lipRgb = mixLipRgb(pack.lipRgb, look.lipRgbMix, look.lipRgbMixT);
        const lipA = look.lipAlpha * vividEff * str;
        const blushRgb = mixLipRgb(pack.blushRgb, look.blushRgbMix, look.blushRgbMixT);
        const browRgb = mixLipRgb(pack.browRgb, look.browRgbMix, look.browRgbMixT);
        const browLift = pack.browLift + (look.browLiftExtra ?? 0);

        const kContour = 0.11;
        const kBlush = 0.26;
        const kHi = 0.078;
        const kFoundation = 0.1;
        const kBrow = 0.58;

        if (videoOk) {
          const alphaScale = look.alphaScale;
          const foundMul = look.foundationMul ?? 1;

          let baseRgb = sampleFaceBaseRgb(video, face);
          if (!baseRgb) baseRgb = [236, 214, 206];
          const foundationRgb = mixLipRgb(baseRgb, [248, 236, 230], 0.28);
          drawFoundation(
            ctx,
            face,
            video,
            canvas,
            foundationRgb,
            kFoundation * alphaScale * str * foundMul,
          );

          const contourRgb = mixLipRgb(pack.contourRgb, [108, 90, 86], 0.2);
          drawContour(
            ctx,
            face,
            video,
            canvas,
            contourRgb,
            kContour * alphaScale * look.contourMul * str,
            look.contourLineWidthMul ?? 1,
          );
          const blushTintRgb = mixLipRgb(blushRgb, baseRgb, 0.3);
          drawBlushWithProfile(
            ctx,
            face,
            video,
            canvas,
            blushTintRgb,
            blushR,
            kBlush * alphaScale * Math.min(1.02, vividEff) * (blushProf?.alphaMul ?? 1) * look.blushMul * str,
            blushProf,
          );
          const hiRgb = mixLipRgb(pack.highlightRgb, [242, 236, 228], 0.45);
          drawHighlight(
            ctx,
            face,
            video,
            canvas,
            hiRgb,
            kHi * alphaScale * look.highlightMul * str,
            look.highlightRadiusMul ?? 1,
          );
          drawBrowsSoft(
            ctx,
            face,
            video,
            canvas,
            browRgb,
            browLift,
            kBrow * alphaScale * look.browMul * str,
            pack.browProfile,
            look.browThicknessMul ?? 1,
          );

          drawLipNatural(ctx, face, video, canvas, lipRgb, lipA);
        }
      }

      if (face) {
        if (!lastFace) {
          lastFace = true;
          onFaceState?.(true);
        }
      } else {
        shapeHistory.length = 0;
        skinHistory.length = 0;
        eyeHistory.length = 0;
        clearTimeout(reportTimer);
        if (lastReportSig !== null || lastScheduledSig !== null) {
          lastReportSig = null;
          lastScheduledSig = null;
          onAnalysis?.(null);
        }
        if (lastFace) {
          lastFace = false;
          onFaceState?.(false);
        }
      }
    }

    raf = requestAnimationFrame(tick);
  }

  function pt(face, i, dy = 0) {
    const lm = face[i];
    if (!lm) return null;
    return mapNormToCanvas(lm.x, lm.y + dy, video, canvas);
  }

  /** 轻薄匀肤：肤色取样 + 大模糊 + soft-light，模拟「有底妆」而非厚涂 */
  function drawFoundation(c, face, video, canvas, rgb, baseA) {
    const pts = FACE_OVAL.map((i) => pt(face, i)).filter(Boolean);
    if (pts.length < 8) return;
    c.save();
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    c.clip();
    c.filter = 'blur(26px)';
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = Math.min(0.26, baseA);
    c.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.restore();
  }

  function drawContour(c, face, video, canvas, rgb, baseA, lineWidthMul = 1) {
    const a = pt(face, 172);
    const b = pt(face, 152);
    const d = pt(face, 397);
    c.save();
    c.filter = 'blur(22px)';
    c.globalAlpha = baseA;
    c.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    c.lineWidth = 13 * lineWidthMul;
    c.lineCap = 'round';
    c.beginPath();
    if (a && b) {
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
    }
    if (d && b) {
      c.moveTo(d.x, d.y);
      c.lineTo(b.x, b.y);
    }
    c.stroke();
    c.restore();
    c.globalAlpha = 1;
    c.filter = 'none';
  }

  /** 按脸型偏移后的腮红中心（颧骨点 + 归一化偏移） */
  function blushPointFromProfile(face, idx, side, profile, video, canvas) {
    const lm = face[idx];
    if (!lm || !profile) return pt(face, idx);
    const ox = side === 'left' ? profile.oxL : profile.oxR;
    const oy = side === 'left' ? profile.oyL : profile.oyR;
    return mapNormToCanvas(lm.x + ox, lm.y + oy, video, canvas);
  }

  /**
   * 腮红：`color` 混合保留肤底明暗与纹理（与唇部思路一致），避免半透明色块「浮在表面」；
   * 人脸轮廓内裁剪 + 略大模糊，边缘更融进皮肤。
   */
  function drawBlushWithProfile(c, face, video, canvas, rgb, radius, baseA, profile) {
    const left = blushPointFromProfile(face, 123, 'left', profile, video, canvas);
    const right = blushPointFromProfile(face, 352, 'right', profile, video, canvas);
    c.save();
    const ovalPts = FACE_OVAL.map((i) => pt(face, i)).filter(Boolean);
    if (ovalPts.length >= 8) {
      c.beginPath();
      c.moveTo(ovalPts[0].x, ovalPts[0].y);
      for (let i = 1; i < ovalPts.length; i++) c.lineTo(ovalPts[i].x, ovalPts[i].y);
      c.closePath();
      c.clip();
    }
    c.filter = 'blur(12px)';
    const prevComp = c.globalCompositeOperation;
    const prevAlpha = c.globalAlpha;
    c.globalCompositeOperation = 'color';
    c.globalAlpha = Math.min(0.5, baseA * 1.02);

    for (const p of [left, right]) {
      if (!p) continue;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.92)`);
      g.addColorStop(0.4, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.38)`);
      g.addColorStop(0.72, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.1)`);
      g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, radius, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = prevComp;
    c.globalAlpha = prevAlpha;
    c.filter = 'none';
    c.restore();
  }

  function drawHighlight(c, face, video, canvas, rgb, baseA, radiusMul = 1) {
    const n = pt(face, 168);
    const f = pt(face, 8);
    const r0 = 10 * radiusMul;
    const r1 = 12 * radiusMul;
    c.save();
    c.filter = 'blur(14px)';
    for (const p of [n, f]) {
      if (!p) continue;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r0);
      g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${baseA})`);
      g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, r1, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    c.filter = 'none';
  }

  function ptBrow(face, i, lift, profile, video, canvas) {
    const lm = face[i];
    if (!lm) return null;
    let ny = lm.y + lift;
    const ar = profile?.archNorm ?? 0;
    if (ar > 0 && (i === 105 || i === 66 || i === 334 || i === 296)) ny -= ar;
    return mapNormToCanvas(lm.x, ny, video, canvas);
  }

  /** 眉形点加密（随眉峰参数弯折） */
  function denseBrowPointsBrow(face, indices, lift, profile, video, canvas) {
    const raw = indices.map((i) => ptBrow(face, i, lift, profile, video, canvas)).filter(Boolean);
    if (raw.length < 2) return [];
    const dense = [];
    for (let i = 0; i < raw.length - 1; i++) {
      dense.push(raw[i]);
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        dense.push({
          x: raw[i].x * (1 - t) + raw[i + 1].x * t,
          y: raw[i].y * (1 - t) + raw[i + 1].y * t,
        });
      }
    }
    dense.push(raw[raw.length - 1]);
    return dense;
  }

  function strokeBrowPolyline(ctx, points) {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  }

  /**
   * 按脸型/眼型 profile 选眉宽与挑度；多层柔边描边模拟眉粉，避免带状填充「糊成一团」
   * @param {import('./makeupPacks.js').getBrowProfile extends (...a:any)=>infer R ? R : any} profile
   */
  function drawBrowsSoft(c, face, video, canvas, rgb, lift, baseA, profile, thicknessScale = 1) {
    const baseProf = profile || { thicknessPx: 7, archNorm: 0.007 };
    const prof = { ...baseProf, thicknessPx: (baseProf.thicknessPx || 7) * thicknessScale };
    const mixRgb = (a, b, t) => [
      a[0] * (1 - t) + b[0] * t,
      a[1] * (1 - t) + b[1] * t,
      a[2] * (1 - t) + b[2] * t,
    ];
    const strokeRgb = mixRgb(rgb, [132, 108, 92], 0.12);
    const coreRgb = mixRgb(rgb, [98, 78, 68], 0.22);

    for (const indices of [LEFT_BROW, RIGHT_BROW]) {
      const dense = denseBrowPointsBrow(face, indices, lift, prof, video, canvas);
      if (dense.length < 4) continue;
      const tw = prof.thicknessPx;

      const drawStroke = (blurPx, lw, aMul, rr, gg, bb) => {
        c.save();
        c.beginPath();
        strokeBrowPolyline(c, dense);
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
        c.globalAlpha = baseA * aMul;
        c.strokeStyle = `rgba(${rr},${gg},${bb},1)`;
        c.lineWidth = lw;
        c.stroke();
        c.restore();
        c.globalAlpha = 1;
        c.filter = 'none';
      };

      drawStroke(5.5, tw * 1.05, 0.22, coreRgb[0], coreRgb[1], coreRgb[2]);
      drawStroke(2.8, tw * 0.72, 0.38, strokeRgb[0], strokeRgb[1], strokeRgb[2]);
      drawStroke(0, tw * 0.42, 0.42, strokeRgb[0], strokeRgb[1], strokeRgb[2]);
    }
  }

  /** 极轻中和，保留唇色倾向，避免发灰豆沙 */
  function lipRgbToNatural(rgb) {
    const neutral = [218, 175, 178];
    const t = 0.055;
    return [
      rgb[0] * (1 - t) + neutral[0] * t,
      rgb[1] * (1 - t) + neutral[1] * t,
      rgb[2] * (1 - t) + neutral[2] * t,
    ];
  }

  /**
   * 唇部着色：画布须已含当前视频帧（与 landmark 对齐）。
   * 使用 `color` 混合保留肤底明暗与纹理，仅叠目标唇色；再 `screen` 弱高光。参考常见美颜类「取色+混合」思路。
   */
  function drawLipNatural(c, face, video, canvas, lipRgb, alpha) {
    const points = [];
    for (const idx of OUTER_LIP_PATH) {
      const lm = face[idx];
      if (!lm) continue;
      points.push(mapNormToCanvas(lm.x, lm.y, video, canvas));
    }
    if (points.length < 8) return;

    const base = lipRgbToNatural(lipRgb);
    const upperTint = [
      Math.min(255, base[0] + 5),
      Math.max(0, base[1] - 3),
      Math.min(255, base[2] + 6),
    ];
    const lowerTint = [
      Math.min(255, base[0] + 3),
      base[1],
      Math.max(0, base[2] - 4),
    ];

    let minx = Infinity;
    let miny = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    for (const p of points) {
      minx = Math.min(minx, p.x);
      miny = Math.min(miny, p.y);
      maxx = Math.max(maxx, p.x);
      maxy = Math.max(maxy, p.y);
    }

    c.save();
    c.beginPath();
    c.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    c.closePath();
    c.clip();

    c.filter = 'blur(0.75px)';

    const prevComp = c.globalCompositeOperation;
    const prevAlpha = c.globalAlpha;

    c.globalCompositeOperation = 'color';
    c.globalAlpha = Math.min(0.9, alpha * 0.8);
    const lin = c.createLinearGradient(minx, miny, minx, maxy);
    lin.addColorStop(0, `rgba(${upperTint[0]},${upperTint[1]},${upperTint[2]},1)`);
    lin.addColorStop(0.48, `rgba(${base[0]},${base[1]},${base[2]},1)`);
    lin.addColorStop(1, `rgba(${lowerTint[0]},${lowerTint[1]},${lowerTint[2]},1)`);
    c.fillStyle = lin;
    c.fillRect(0, 0, canvas.width, canvas.height);

    const lm0 = face[0];
    const lm17 = face[17];
    if (lm0 && lm17) {
      const cx = mapNormToCanvas((lm0.x + lm17.x) / 2, (lm0.y + lm17.y) / 2, video, canvas);
      let maxR = 12;
      for (const p of points) {
        const d = Math.hypot(p.x - cx.x, p.y - cx.y);
        if (d > maxR) maxR = d;
      }
      maxR = Math.max(maxR * 0.88, 10);
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = alpha * 0.16;
      const rg = c.createRadialGradient(cx.x, cx.y, 0, cx.x, cx.y, maxR);
      rg.addColorStop(0, 'rgba(255,255,255,0.55)');
      rg.addColorStop(0.45, `rgba(${Math.min(255, base[0] + 40)},${Math.min(255, base[1] + 28)},${Math.min(255, base[2] + 22)},0.25)`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, canvas.width, canvas.height);
    }

    c.globalCompositeOperation = prevComp;
    c.globalAlpha = prevAlpha;
    c.filter = 'none';
    c.restore();
  }

  tick();
  return () => {
    stopped = true;
    clearTimeout(reportTimer);
    cancelAnimationFrame(raf);
    setVideoUnderlayVisible(true);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shapeHistory.length = 0;
    skinHistory.length = 0;
    eyeHistory.length = 0;
    lastReportSig = null;
    lastScheduledSig = null;
    if (lastFace) onFaceState?.(false);
    lastFace = false;
  };
}
