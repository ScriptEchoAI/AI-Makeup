/**
 * 规则妆容包：脸型 × 场合 × 关系 ×（可选）肤色 ×（可选）眼型 → 颜色与文案。
 */

import { SHAPE_LABELS } from './faceShape.js';

const OCCASION = ['travel', 'party', 'holiday', 'daily'];

/** 基底：每种脸型的结构倾向（再叠场合偏移） */
const SHAPE_BASE = {
  round: {
    browHint: '略挑、带眉峰，拉长中庭视觉。',
    lipBias: [12, -4, -6],
    blushBias: [8, 6, 4],
    contourBias: [6, 4, 2],
  },
  long: {
    browHint: '平眉或微弯，避免过高眉峰。',
    lipBias: [-4, 8, 12],
    blushBias: [10, 4, 6],
    contourBias: [4, 4, 6],
  },
  square: {
    browHint: '柔和弯眉，弱化下颌棱角。',
    lipBias: [6, 0, 8],
    blushBias: [12, 8, 10],
    contourBias: [8, 6, 8],
  },
  heart: {
    browHint: '自然平弯，下缘略收，平衡宽额头。',
    lipBias: [0, 6, 10],
    blushBias: [14, 6, 8],
    contourBias: [6, 8, 10],
  },
  oval: {
    browHint: '标准弯眉即可，保持对称。',
    lipBias: [0, 0, 0],
    blushBias: [10, 6, 8],
    contourBias: [6, 6, 6],
  },
};

const OCCASION_TINT = {
  travel: { lip: [10, 4, -2], name: '旅行拍照', vivid: 1.02 },
  party: { lip: [12, -4, 4], name: '年会/聚会', vivid: 1.05 },
  holiday: { lip: [8, 3, 8], name: '节假日', vivid: 1.03 },
  daily: { lip: [-4, 3, 4], name: '日常', vivid: 0.92 },
};

function clampRgb([r, g, b]) {
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ];
}

function mix(base, bias, scale = 1) {
  return clampRgb([base[0] + bias[0] * scale, base[1] + bias[1] * scale, base[2] + bias[2] * scale]);
}

function skinAdjustLip(baseRgb, skin) {
  if (!skin || skin.confidence < 0.35) return baseRgb;
  let [r, g, b] = baseRgb;
  const w = Math.min(1, skin.confidence) * 0.62;
  if (skin.depthKey === 'deep') {
    r += 5 * w;
    g += 1 * w;
    b -= 3 * w;
  } else if (skin.depthKey === 'light') {
    r += 3 * w;
    g += 4 * w;
    b += 5 * w;
  }
  if (skin.undertone === 'warm') {
    r += 5 * w;
    g += 2 * w;
    b -= 4 * w;
  } else if (skin.undertone === 'cool') {
    r += 4 * w;
    g -= 1 * w;
    b += 6 * w;
  }
  return clampRgb([r, g, b]);
}

function skinAdjustBlush(baseRgb, skin) {
  if (!skin || skin.confidence < 0.35) return baseRgb;
  const w = Math.min(1, skin.confidence);
  let out = [...baseRgb];
  if (skin.depthKey === 'deep') {
    out = mix(out, [18, -4, -8], 0.35 * w);
  }
  if (skin.undertone === 'warm') {
    out = mix(out, [12, 8, -6], 0.25 * w);
  } else if (skin.undertone === 'cool') {
    out = mix(out, [8, -4, 12], 0.25 * w);
  }
  return out;
}

/**
 * 根据脸型 + 眼型选眉形参数（规则演示，非美学诊断）。
 * @param {string} shapeKey
 * @param {string} [eyeKey]
 */
export function getBrowProfile(shapeKey, eyeKey) {
  const ek = eyeKey || 'almond';
  let name = '标准弯眉';
  let thicknessPx = 8.2;
  /** 归一化坐标下眉峰上抬量，越大越挑 */
  let archNorm = 0.0075;
  switch (shapeKey) {
    case 'round':
      name = '微挑眉';
      thicknessPx = 9.2;
      archNorm = 0.011;
      break;
    case 'long':
      name = '平实眉';
      thicknessPx = 7.2;
      archNorm = 0.0028;
      break;
    case 'square':
      name = '柔弯眉';
      thicknessPx = 8.5;
      archNorm = 0.0085;
      break;
    case 'heart':
      name = '略挑眉';
      thicknessPx = 8.7;
      archNorm = 0.0095;
      break;
    default:
      name = '自然弯眉';
      thicknessPx = 8.3;
      archNorm = 0.0078;
  }
  if (ek === 'long') thicknessPx += 0.4;
  if (ek === 'round') thicknessPx -= 0.3;
  return { name, thicknessPx, archNorm };
}

/**
 * 腮红相对颧骨点的归一化偏移与大小系数（随脸型）。
 * @param {string} shapeKey
 */
export function getBlushProfile(shapeKey) {
  switch (shapeKey) {
    case 'round':
      return { oxL: -0.01, oyL: -0.03, oxR: 0.01, oyR: -0.03, radiusMul: 0.84, alphaMul: 1.06 };
    case 'long':
      return { oxL: 0.02, oyL: 0.01, oxR: -0.02, oyR: 0.01, radiusMul: 1.08, alphaMul: 0.94 };
    case 'square':
      return { oxL: 0, oyL: -0.012, oxR: 0, oyR: -0.012, radiusMul: 0.86, alphaMul: 1 };
    case 'heart':
      return { oxL: -0.005, oyL: -0.024, oxR: 0.005, oyR: -0.024, radiusMul: 0.83, alphaMul: 1.04 };
    default:
      return { oxL: 0, oyL: -0.016, oxR: 0, oyR: -0.016, radiusMul: 0.93, alphaMul: 1 };
  }
}

function eyeTipLine(eye) {
  if (!eye) return null;
  if (eye.key === 'round') return '眼妆：可略拉长外眼线，平衡圆眼比例；避免过粗内眼线。';
  if (eye.key === 'long') return '眼妆：横向晕染即可，避免再加重眼尾长度。';
  return '眼妆：沿睫毛根部自然过渡，眼尾与眼型走向一致。';
}

/**
 * @param {string} shapeKey
 * @param {string} occasion
 * @param {'self'|'elder'|null} relation
 * @param {ReturnType<typeof import('./skinTone.js').mergeSkinHistory>} [skinAnalysis]
 * @param {ReturnType<typeof import('./eyeShape.js').mergeEyeHistory>} [eyeAnalysis]
 */
export function resolveMakeupPack(shapeKey, occasion, relation, skinAnalysis, eyeAnalysis) {
  const occ = OCCASION.includes(occasion) ? occasion : 'daily';
  const base = SHAPE_BASE[shapeKey] || SHAPE_BASE.oval;
  const tint = OCCASION_TINT[occ];
  const elder = relation === 'elder';

  /** 玫瑰/豆沙基调，肤色微调后略提亮，避免发灰 */
  let lipBase = elder ? [188, 132, 138] : [205, 118, 128];
  lipBase = skinAdjustLip(lipBase, skinAnalysis);
  let lipRgb = mix(
    lipBase,
    mix(base.lipBias, tint.lip, 0.38),
    elder ? 0.62 : 0.88
  );
  lipRgb = mix(lipRgb, [220, 150, 155], 0.06);

  let blushBase = elder ? [230, 150, 140] : [240, 120, 132];
  blushBase = skinAdjustBlush(mix(blushBase, base.blushBias, elder ? 0.5 : 0.85), skinAnalysis);
  const blushRgb = blushBase;

  const contourRgb = mix([88, 62, 58], base.contourBias, elder ? 0.45 : 0.7);
  const highlightRgb = elder ? [255, 248, 235] : [255, 252, 245];
  const browRgb = elder ? [118, 95, 82] : [105, 88, 78];

  let vivid = elder ? tint.vivid * 0.88 : tint.vivid;
  if (skinAnalysis && skinAnalysis.confidence > 0.5) {
    vivid *= skinAnalysis.depthKey === 'deep' ? 1.05 : skinAnalysis.depthKey === 'light' ? 0.96 : 1;
  }

  const browProfile = getBrowProfile(shapeKey, eyeAnalysis?.key);
  const blushProfile = getBlushProfile(shapeKey);

  let lipSmartLine = '';
  if (skinAnalysis && skinAnalysis.confidence >= 0.35) {
    const u =
      skinAnalysis.undertone === 'warm'
        ? '暖底略偏珊瑚红'
        : skinAnalysis.undertone === 'cool'
          ? '冷底略偏玫瑰粉'
          : '中性底';
    const d =
      skinAnalysis.depthKey === 'deep'
        ? '略加深唇色避免发灰'
        : skinAnalysis.depthKey === 'light'
          ? '略提亮避免显脏'
          : '';
    lipSmartLine = `唇色：${u}${d ? `；${d}` : ''}（取样置信约 ${Math.round(skinAnalysis.confidence * 100)}%）。`;
  } else {
    lipSmartLine = `唇色：按「${tint.name}」与${SHAPE_LABELS[shapeKey] || '当前脸型'}微调明暗与饱和度（未稳定取样肤色时用通用规则）。`;
  }

  const eyeLine = eyeTipLine(eyeAnalysis);
  const tips = [
    lipSmartLine,
    `眉形（${browProfile.name}）：${base.browHint}`,
    `腮红：${shapeKey === 'long' ? '横向轻扫苹果肌，增加宽度感。' : shapeKey === 'round' ? '斜向太阳穴提拉，避免团状中心腮红。' : '以颧骨最高点为心，自然晕染。'}`,
    `修容：${shapeKey === 'square' ? '下颌线阴影柔和过渡，避免硬直线。' : shapeKey === 'heart' ? '发际线与下颌轻扫阴影，平衡上下量感。' : '侧脸外轮廓轻扫，保持边缘虚化。'}`,
    eyeLine || `高光：${elder ? '点涂鼻梁与眉骨即可，避免大面积亮片。' : 'T 区与颧骨高点轻点，注意与腮红衔接。'}`,
  ];

  let skinNote = '';
  if (skinAnalysis && skinAnalysis.confidence >= 0.35) {
    skinNote = `已参考取样肤色（${skinAnalysis.label}，置信度约 ${Math.round(skinAnalysis.confidence * 100)}%）。`;
  }
  let eyeNote = '';
  if (eyeAnalysis) {
    eyeNote = `眼型倾向：${eyeAnalysis.label}。`;
  }

  const summary = elder
    ? `根据脸型、场合与「${tint.name}」${skinNote}${eyeNote}已收敛饱和度、偏豆沙/珊瑚系（规则演示）。`
    : `「${tint.name}」：唇色随${skinAnalysis && skinAnalysis.confidence >= 0.35 ? '摄像头取样肤色的冷暖与明暗' : '脸型与场合通用规则'}微调；眉形为「${browProfile.name}」；腮红位置随颧骨与脸型偏移。以上为规则引擎演示，非专业色号结论。`;

  return {
    lipRgb,
    blushRgb,
    contourRgb,
    highlightRgb,
    browRgb,
    vivid,
    tips,
    summaryLine: summary,
    browLift: shapeKey === 'long' ? 0.004 : shapeKey === 'round' ? -0.003 : 0,
    browProfile,
    blushProfile,
  };
}
