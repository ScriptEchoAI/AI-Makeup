/**
 * MediaPipe Face Landmarker：WASM/模型加载与坐标映射。
 * 唇部路径与 Face Mesh 478 点拓扑一致；绘制逻辑见 src/makeup/faceMakeupOverlay.js。
 */
const MP_VERSION = '0.10.14';
const WASM_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** 外唇一圈（闭合），顺序沿唇周 */
export const OUTER_LIP_PATH = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
];

/**
 * 归一化 landmark (0–1) → canvas 像素；与 video object-cover 裁切一致。
 */
export function mapNormToCanvas(nx, ny, video, canvas) {
  const iw = video.videoWidth;
  const ih = video.videoHeight;
  const cw = canvas.width;
  const ch = canvas.height;
  if (!iw || !ih || !cw || !ch) return { x: 0, y: 0 };
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  return {
    x: nx * iw * scale + ox,
    y: ny * ih * scale + oy,
  };
}

/**
 * 将视频帧按与 mapNormToCanvas 相同的 object-cover 规则铺满画布（用于唇妆等与像素对齐的混合）。
 */
export function drawVideoCover(ctx, video, canvas) {
  const iw = video.videoWidth;
  const ih = video.videoHeight;
  const cw = canvas.width;
  const ch = canvas.height;
  if (!iw || !ih || !cw || !ch) return;
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  ctx.drawImage(video, 0, 0, iw, ih, ox, oy, dw, dh);
}

export async function createFaceLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
  try {
    return await FaceLandmarker.createFromOptions(vision, opts('GPU'));
  } catch {
    return await FaceLandmarker.createFromOptions(vision, opts('CPU'));
  }
}
