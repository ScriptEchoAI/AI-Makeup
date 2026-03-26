/**
 * 基于 Face Landmarker 归一化点的简易脸型分类（规则演示，非专业面诊）。
 * 索引与 MediaPipe Face Mesh 478 拓扑一致。
 */

export const SHAPE_KEYS = ['round', 'long', 'square', 'heart', 'oval'];

export const SHAPE_LABELS = {
  round: '圆脸',
  long: '长脸',
  square: '方脸',
  heart: '心形脸',
  oval: '椭圆脸',
};

/** @param {{x:number,y:number,z?:number}[]} landmarks */
export function classifyFaceShape(landmarks) {
  const p = (i) => landmarks[i];
  const dist = (a, b) => {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const cheekW = dist(p(234), p(454));
  const faceH = dist(p(10), p(152));
  const jawW = dist(p(172), p(397));
  const foreheadW = dist(p(21), p(251));

  if (!cheekW || !faceH) {
    return { shape: 'oval', label: '椭圆脸', metrics: { ratio: 0.75, jawRatio: 0.9, heartRatio: 1 } };
  }

  const ratio = cheekW / faceH;
  const jawRatio = jawW / cheekW;
  const heartRatio = foreheadW / Math.max(jawW, 1e-6);

  let shape = 'oval';
  if (heartRatio > 1.1 && jawRatio < 0.92) shape = 'heart';
  else if (jawRatio > 0.9) shape = 'square';
  else if (ratio > 0.82) shape = 'round';
  else if (ratio < 0.72) shape = 'long';

  return {
    shape,
    label: SHAPE_LABELS[shape],
    metrics: { ratio, jawRatio, heartRatio },
  };
}
