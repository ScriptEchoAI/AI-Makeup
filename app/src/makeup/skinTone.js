/**
 * 从 video 帧 + 人脸关键点取样肤色（演示级，非医疗/色号结论）。
 * 灰世界简单白平衡 + Lab 亮度分档 + R/B 判断冷暖。
 */

let sampleCanvas;
let sampleCtx;

function getCtx() {
  if (!sampleCanvas) {
    sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 48;
    sampleCanvas.height = 48;
    sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  return sampleCtx;
}

function samplePatch(video, cx, cy, half) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const x0 = Math.max(0, Math.floor(cx - half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const cw = Math.min(half * 2 + 1, vw - x0);
  const ch = Math.min(half * 2 + 1, vh - y0);
  if (cw < 3 || ch < 3) return null;
  const ctx = getCtx();
  if (sampleCanvas.width < cw || sampleCanvas.height < ch) {
    sampleCanvas.width = cw;
    sampleCanvas.height = ch;
  }
  try {
    ctx.drawImage(video, x0, y0, cw, ch, 0, 0, cw, ch);
  } catch {
    return null;
  }
  const data = ctx.getImageData(0, 0, cw, ch).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  if (!n) return null;
  return { r: r / n, g: g / n, b: b / n };
}

function grayWorldBalance(rgb) {
  const avg = (rgb.r + rgb.g + rgb.b) / 3;
  if (avg < 1e-6) return rgb;
  const k = 128 / avg;
  return {
    r: Math.min(255, rgb.r * k),
    g: Math.min(255, rgb.g * k),
    b: Math.min(255, rgb.b * k),
  };
}

function rgbToLab(rgb) {
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const fx = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * @param {HTMLVideoElement} video
 * @param {{x:number,y:number}[]} face
 * @returns {{ depthKey: string, depthLabel: string, undertone: string, undertoneLabel: string, confidence: number, label: string } | null}
 */
export function analyzeSkinTone(video, face) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || !face) return null;

  const regions = [
    { idx: 10, half: 12 },
    { idx: 123, half: 11 },
    { idx: 352, half: 11 },
  ];
  const patches = [];
  for (const { idx, half } of regions) {
    const lm = face[idx];
    if (!lm) continue;
    const cx = lm.x * vw;
    const cy = lm.y * vh;
    const s = samplePatch(video, cx, cy, half);
    if (s) patches.push({ idx, rgb: s });
  }
  if (patches.length < 2) return null;

  const cheekL = patches.find((p) => p.idx === 123)?.rgb;
  const cheekR = patches.find((p) => p.idx === 352)?.rgb;
  let diff = 0.2;
  if (cheekL && cheekR) {
    diff = Math.hypot(cheekL.r - cheekR.r, cheekL.g - cheekR.g, cheekL.b - cheekR.b) / 255;
  }
  const confidence = Math.max(0, Math.min(1, 1 - diff * 4));

  let sum = { r: 0, g: 0, b: 0 };
  for (const p of patches) {
    sum.r += p.rgb.r;
    sum.g += p.rgb.g;
    sum.b += p.rgb.b;
  }
  sum.r /= patches.length;
  sum.g /= patches.length;
  sum.b /= patches.length;

  const bal = grayWorldBalance(sum);
  const lab = rgbToLab(bal);

  let undertone = 'neutral';
  if (bal.r - bal.b > 12) undertone = 'warm';
  else if (bal.b - bal.r > 10) undertone = 'cool';

  const undertoneLabel = { warm: '偏暖', cool: '偏冷', neutral: '中性' }[undertone];

  let depthKey = 'medium';
  if (lab.L > 72) depthKey = 'light';
  else if (lab.L < 48) depthKey = 'deep';

  const depthLabel = { light: '浅', medium: '中', deep: '深' }[depthKey];

  const label = `${depthLabel}肤·${undertoneLabel}`;

  return {
    depthKey,
    depthLabel,
    undertone,
    undertoneLabel,
    confidence,
    label,
    labL: lab.L,
  };
}

/**
 * @param {ReturnType<typeof analyzeSkinTone>[]} history
 */
export function mergeSkinHistory(history) {
  const valid = history.filter(Boolean);
  if (valid.length < 2) return null;
  const undertones = ['warm', 'cool', 'neutral'];
  const counts = {};
  let sumL = 0;
  let sumConf = 0;
  for (const u of undertones) counts[u] = 0;
  for (const h of valid) {
    counts[h.undertone]++;
    sumL += h.labL ?? 60;
    sumConf += h.confidence;
  }
  const undertone = undertones.sort((a, b) => counts[b] - counts[a])[0];
  const avgL = sumL / valid.length;
  let depthKey = 'medium';
  if (avgL > 70) depthKey = 'light';
  else if (avgL < 50) depthKey = 'deep';
  const depthLabel = { light: '浅', medium: '中', deep: '深' }[depthKey];
  const undertoneLabel = { warm: '偏暖', cool: '偏冷', neutral: '中性' }[undertone];
  return {
    depthKey,
    depthLabel,
    undertone,
    undertoneLabel,
    confidence: sumConf / valid.length,
    label: `${depthLabel}肤·${undertoneLabel}`,
    labL: avgL,
  };
}

/**
 * 取样额头 + 双颊平均色，经灰世界白平衡，供底妆匀肤叠层（规则演示）。
 * @returns {[number, number, number] | null}
 */
export function sampleFaceBaseRgb(video, face) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || !face) return null;
  const regions = [
    { idx: 10, half: 12 },
    { idx: 123, half: 11 },
    { idx: 352, half: 11 },
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const { idx, half } of regions) {
    const lm = face[idx];
    if (!lm) continue;
    const cx = lm.x * vw;
    const cy = lm.y * vh;
    const s = samplePatch(video, cx, cy, half);
    if (s) {
      r += s.r;
      g += s.g;
      b += s.b;
      n++;
    }
  }
  if (!n) return null;
  const bal = grayWorldBalance({ r: r / n, g: g / n, b: b / n });
  return [Math.round(bal.r), Math.round(bal.g), Math.round(bal.b)];
}
