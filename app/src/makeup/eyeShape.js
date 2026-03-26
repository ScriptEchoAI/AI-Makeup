/**
 * 双眼几何：眼裂宽高比 + 外眼角倾斜 → 简易眼型标签（规则演示）。
 * 左：33-133 宽，159-145 高；右：362-263 宽，386-374 高。
 */

/**
 * @param {{x:number,y:number}[]} face
 */
export function classifyEyeShape(face) {
  const need = [33, 133, 159, 145, 362, 263, 386, 374];
  for (const i of need) {
    if (!face[i]) return null;
  }

  const leftW = dist(face[33], face[133]);
  const leftH = Math.max(dist(face[159], face[145]), 1e-6);
  const rightW = dist(face[362], face[263]);
  const rightH = Math.max(dist(face[386], face[374]), 1e-6);

  const arL = leftW / leftH;
  const arR = rightW / rightH;
  const aspect = (arL + arR) / 2;

  const tiltL = Math.atan2(face[133].y - face[33].y, face[133].x - face[33].x);
  const tiltR = Math.atan2(face[263].y - face[362].y, face[263].x - face[362].x);
  const tilt = (tiltL + tiltR) / 2;

  let key = 'almond';
  if (aspect < 2.15) key = 'round';
  else if (aspect > 2.95) key = 'long';

  let modifier = '';
  if (tilt < -0.12) modifier = 'downturn';
  else if (tilt > 0.12) modifier = 'upturn';

  const labels = {
    round: '圆眼',
    almond: '杏眼',
    long: '细长眼',
  };

  const modLabels = {
    '': '',
    downturn: '·略下垂',
    upturn: '·略上扬',
  };

  return {
    key,
    modifier,
    label: labels[key] + (modLabels[modifier] || ''),
    aspect,
    tilt,
  };
}

function dist(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * @param {ReturnType<typeof classifyEyeShape>[]} history
 */
export function mergeEyeHistory(history) {
  const valid = history.filter(Boolean);
  if (valid.length < 2) return null;
  const keys = ['round', 'almond', 'long'];
  const counts = {};
  for (const k of keys) counts[k] = 0;
  for (const h of valid) counts[h.key]++;
  const key = keys.sort((a, b) => counts[b] - counts[a])[0];
  const tiltAvg = valid.reduce((s, h) => s + h.tilt, 0) / valid.length;
  let modifier = '';
  if (tiltAvg < -0.1) modifier = 'downturn';
  else if (tiltAvg > 0.1) modifier = 'upturn';
  const labels = { round: '圆眼', almond: '杏眼', long: '细长眼' };
  const modLabels = { '': '', downturn: '·略下垂', upturn: '·略上扬' };
  return {
    key,
    modifier,
    label: labels[key] + (modLabels[modifier] || ''),
    aspect: valid.reduce((s, h) => s + h.aspect, 0) / valid.length,
    tilt: tiltAvg,
  };
}
