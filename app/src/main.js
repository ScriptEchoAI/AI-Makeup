  import { createFaceLandmarker } from './lips/lipLandmarker.js';
  import { startFaceMakeupOverlay } from './makeup/faceMakeupOverlay.js';
  import {
    DEFAULT_LOOK_ID,
    DEFAULT_LOOK_SLIDER,
    getLookPreset,
    LOOK_PRESETS,
    sliderToStrength,
  } from './makeup/makeupLookPresets.js';

  const STORAGE_KEY = 'ai_makeup_proto_v1';
  const hashScreen = () => (location.hash || '#onboarding').replace('#', '').split('?')[0];

  let state = {
    step: 1,
    occasion: null,
    age: null,
    relation: null,
    lookId: DEFAULT_LOOK_ID,
    /** @type {Record<string, number>} 各预设妆容浓度滑杆 0～100 */
    lookStrength: {},
  };

  /** @type {{ shapeKey: string, label: string, pack: { summaryLine: string, tips: string[] }, skin?: { label: string, confidence: number } | null, eye?: { label: string } | null } | null | undefined} */
  let lastFaceAnalysis = null;

  function ensureLookStrength() {
    if (!state.lookStrength || typeof state.lookStrength !== 'object') state.lookStrength = {};
    LOOK_PRESETS.forEach((p) => {
      const v = state.lookStrength[p.id];
      if (typeof v !== 'number' || Number.isNaN(v)) state.lookStrength[p.id] = DEFAULT_LOOK_SLIDER;
    });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(state, JSON.parse(raw));
    } catch (e) {}
    state.lookId = getLookPreset(state.lookId).id;
    ensureLookStrength();
  }
  function saveState() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const el = (id) => document.getElementById(id);
  const screens = {
    onboarding: el('screen-onboarding'),
    ar: el('screen-ar'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.add('hidden'));
    if (screens[name]) screens[name].classList.remove('hidden');
    const back = el('btn-back');
    if (name === 'ar') back.classList.remove('hidden');
    else back.classList.add('hidden');
  }

  function setHash(screen) {
    if (location.hash.replace('#', '').split('?')[0] !== screen) {
      location.hash = screen;
    }
  }

  function renderOnboarding() {
    document.querySelectorAll('.step-pill').forEach((p) => {
      const n = +p.dataset.step;
      p.classList.toggle('bg-brand', n <= state.step);
      p.classList.toggle('bg-stone-200', n > state.step);
    });
    for (let i = 1; i <= 3; i++) {
      el('onb-step-' + i).classList.toggle('hidden', i !== state.step);
    }
    el('btn-onb-prev').classList.toggle('hidden', state.step === 1);
    const next = el('btn-onb-next');
    if (state.step === 3) {
      next.textContent = '进入试妆';
    } else {
      next.textContent = '下一步';
    }
    next.disabled = !canProceed();
  }

  function canProceed() {
    if (state.step === 1) return !!state.occasion;
    if (state.step === 2) return !!state.age;
    if (state.step === 3) return !!state.relation;
    return false;
  }

  const occasionLabels = { travel: '旅行拍照', party: '公司年会', holiday: '节假日聚会', daily: '日常出门' };
  const ageLabels = { '18-25': '18–25', '26-35': '26–35', '36-45': '36–45', '46-55': '46–55', '55+': '55 及以上' };

  /**
   * @param {{ shapeKey: string, label: string, pack: { summaryLine: string, tips: string[] }, skin?: { label: string, confidence: number } | null, eye?: { label: string } | null } | null | undefined} faceAnalysis
   */
  function buildAdvice(faceAnalysis) {
    ensureLookStrength();
    const lk = getLookPreset(state.lookId);
    const conc = state.lookStrength[state.lookId] ?? DEFAULT_LOOK_SLIDER;
    const occ = occasionLabels[state.occasion] || '当前场合';
    const age = ageLabels[state.age] || '所选年龄';
    const forElder = state.relation === 'elder';

    let summary = forElder
      ? `「${occ}」场景下，针对长辈肤质与气质，建议以清透底妆 + 柔和眉眼为主，避免厚重色彩。已按您选择的年龄段（${age}）生成结构建议。`
      : `「${occ}」场景下，结合您选择的年龄段（${age}），推荐以下风格结构与注意点。`;

    summary = `已选妆容：<strong>${lk.name}</strong>（${lk.tagline}），该预设浓度 <strong>${conc}%</strong>。 ${summary}`;
    if (lk.styleNote) {
      summary += `<br/><span class="text-xs text-stone-500 leading-snug block mt-1.5">${escapeHtml(lk.styleNote)}</span>`;
    }

    if (faceAnalysis) {
      summary +=
        ` <strong>脸型：${faceAnalysis.label}</strong>（规则演示）。`;
      if (faceAnalysis.skin) {
        summary += ` <strong>肤色取样：${faceAnalysis.skin.label}</strong>（置信度约 ${Math.round((faceAnalysis.skin.confidence || 0) * 100)}%，非色号结论）。`;
      }
      if (faceAnalysis.eye) {
        summary += ` <strong>眼型：${faceAnalysis.eye.label}</strong>（几何规则）。`;
      }
      summary += ` ${faceAnalysis.pack.summaryLine}`;
    } else {
      summary += `（面部入镜后，将根据脸型、肤色与眼型倾向<strong>自动匹配</strong>妆容包，见下方条目。）`;
    }

    const defaultItems = forElder
      ? [
          '眉形：保持自然弧度，略提眉峰即可，避免过细过挑。',
          '唇色：选择豆沙、珊瑚等低饱和色，不宜过浓或满涂高亮。',
          '眼妆：哑光大地色轻扫轮廓即可，避免大亮片与过粗眼线。',
          '腮红：位置略靠上、范围小，提气色即可。',
        ]
      : [
          '眉形：按脸型微调眉头间距，保持根根分明感。',
          '唇色：随所选妆容预设变化；真实效果受光线与产品影响。',
          '眼妆：先结构后色彩，注意眼窝过渡避免生硬边界。',
          '整体：预览为规则 AR，非最终成片。',
        ];

    const items = faceAnalysis?.pack?.tips?.length ? faceAnalysis.pack.tips : defaultItems;

    el('advice-summary').innerHTML = summary;
    const ul = el('advice-list');
    ul.innerHTML = items.map((t) => '<li class="flex gap-2"><span class="text-brand shrink-0">·</span><span>' + t + '</span></li>').join('');

    const pill = el('face-shape-pill');
    if (pill) {
      pill.classList.toggle('hidden', !faceAnalysis);
      if (faceAnalysis) pill.textContent = faceAnalysis.label;
    }
    const skinP = el('skin-tone-pill');
    if (skinP) {
      const show = !!(faceAnalysis && faceAnalysis.skin);
      skinP.classList.toggle('hidden', !show);
      if (show && faceAnalysis.skin) skinP.textContent = faceAnalysis.skin.label;
    }
    const eyeP = el('eye-shape-pill');
    if (eyeP) {
      const show = !!(faceAnalysis && faceAnalysis.eye);
      eyeP.classList.toggle('hidden', !show);
      if (show && faceAnalysis.eye) eyeP.textContent = faceAnalysis.eye.label;
    }

    el('advice-tag').textContent = faceAnalysis ? '跟脸规则配妆' : forElder ? '帮长辈模式' : '已按画像';

    el('hint-banner').classList.toggle('hidden', !forElder);
  }

  /** 唇部 MediaPipe 检测到人脸时隐藏示意唇、略弱轮廓线 */
  let lipFaceOk = false;
  let stopLip = null;
  let lipPipelineGen = 0;

  function applyArVisuals() {
    const lk = getLookPreset(state.lookId);
    el('ar-overlay').style.opacity = String(lipFaceOk ? lk.outlineWhenLip : lk.outlineOpacity);
    el('demo-makeup').style.opacity = lipFaceOk ? '0' : String(lk.demoMakeupOpacity);
  }

  function setArModeBadge(text) {
    const b = el('ar-mode-badge');
    if (b) b.textContent = text;
  }

  function stopLipTracking() {
    if (stopLip) {
      stopLip();
      stopLip = null;
    }
    lipFaceOk = false;
  }

  async function startArLipPipeline() {
    const gen = ++lipPipelineGen;
    stopLipTracking();
    applyArVisuals();

    const video = el('cam-video');
    const canvas = el('lip-canvas');
    if (!video || !canvas) return;

    setArModeBadge('人脸模型加载中…');

    let landmarker;
    try {
      landmarker = await createFaceLandmarker();
    } catch {
      if (gen !== lipPipelineGen || hashScreen() !== 'ar') return;
      setArModeBadge('示意叠层（模型未加载）');
      showToast('人脸模型加载失败，已沿用示意叠层');
      applyArVisuals();
      return;
    }

    if (gen !== lipPipelineGen || hashScreen() !== 'ar') return;

    setArModeBadge(`${getLookPreset(state.lookId).name} · 跟脸预览`);

    stopLip = startFaceMakeupOverlay({
      video,
      canvas,
      landmarker,
      getLookTuning: () => {
        ensureLookStrength();
        const p = getLookPreset(state.lookId);
        const s = state.lookStrength[state.lookId] ?? DEFAULT_LOOK_SLIDER;
        return { ...p, strengthMul: sliderToStrength(s) };
      },
      getOccasion: () => state.occasion,
      getRelation: () => state.relation,
      onFaceState: (ok) => {
        lipFaceOk = ok;
        applyArVisuals();
      },
      onAnalysis: (a) => {
        if (gen !== lipPipelineGen || hashScreen() !== 'ar') return;
        lastFaceAnalysis = a || undefined;
        buildAdvice(a || undefined);
      },
    });
  }

  function syncStrengthSliderFromState() {
    const slider = el('look-strength-slider');
    const pct = el('look-strength-pct');
    if (!slider || !pct) return;
    const v = state.lookStrength[state.lookId] ?? DEFAULT_LOOK_SLIDER;
    slider.value = String(v);
    pct.textContent = `${v}%`;
  }

  function showStrengthPanel() {
    const panel = el('look-strength-panel');
    if (panel) panel.classList.remove('hidden');
  }

  function renderLookChips() {
    const wrap = el('look-chip-row');
    if (!wrap || wrap.dataset.rendered === '1') return;
    wrap.dataset.rendered = '1';
    ensureLookStrength();

    LOOK_PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.lookId = p.id;
      b.textContent = p.name;
      b.title = `${p.tagline}\n\n${p.styleNote}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', p.id === state.lookId ? 'true' : 'false');
      b.className =
        'look-chip px-2.5 py-1.5 rounded-full text-[11px] font-medium border transition-colors border-stone-200 bg-white text-stone-700 hover:border-brand/50';
      wrap.appendChild(b);
    });

    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-look-id]');
      if (!b) return;
      const id = b.dataset.lookId;
      if (id === state.lookId) return;
      state.lookId = id;
      saveState();
      syncLookChips();
      syncStrengthSliderFromState();
      showStrengthPanel();
      applyArVisuals();
      const lk = getLookPreset(state.lookId);
      showToast(`已切换：${lk.name}`);
      setArModeBadge(`${lk.name} · 跟脸预览`);
      buildAdvice(lastFaceAnalysis);
    });

    const slider = el('look-strength-slider');
    if (slider && !slider.dataset.bound) {
      slider.dataset.bound = '1';
      slider.addEventListener('input', () => {
        const v = +slider.value;
        state.lookStrength[state.lookId] = v;
        const pct = el('look-strength-pct');
        if (pct) pct.textContent = `${v}%`;
        saveState();
        applyArVisuals();
        setArModeBadge(`${getLookPreset(state.lookId).name} · 跟脸预览`);
        buildAdvice(lastFaceAnalysis);
      });
    }

    syncLookChips();
    syncStrengthSliderFromState();
    showStrengthPanel();
  }

  function syncLookChips() {
    document.querySelectorAll('#look-chip-row .look-chip').forEach((btn) => {
      const on = btn.dataset.lookId === state.lookId;
      btn.classList.toggle('border-brand', on);
      btn.classList.toggle('bg-brand/10', on);
      btn.classList.toggle('text-brand', on);
      btn.classList.toggle('text-stone-700', !on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function showToast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.remove('opacity-0', 'pointer-events-none');
    t.classList.add('toast-in');
    clearTimeout(showToast._tid);
    showToast._tid = setTimeout(() => {
      t.classList.add('opacity-0', 'pointer-events-none');
      t.classList.remove('toast-in');
    }, 2200);
  }

  function tryCamera() {
    return new Promise((resolve) => {
      const video = el('cam-video');
      const ph = el('cam-placeholder');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        resolve(false);
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        .then((stream) => {
          video.srcObject = stream;
          video.classList.remove('opacity-0', 'pointer-events-none');
          video.classList.add('opacity-100');
          ph.classList.add('opacity-20');
          const hint = el('cam-hint');
          if (hint) hint.classList.add('opacity-0');
          resolve(true);
        })
        .catch(() => resolve(false));
    });
  }

  function route() {
    const h = hashScreen();
    if (h === 'ar') {
      if (!state.occasion || !state.age || !state.relation) {
        location.hash = 'onboarding';
        return;
      }
      showScreen('ar');
      renderLookChips();
      buildAdvice(lastFaceAnalysis);
      lipFaceOk = false;
      applyArVisuals();
      setArModeBadge('准备中…');
      tryCamera();
      startArLipPipeline();
    } else {
      stopLipTracking();
      applyArVisuals();
      showScreen('onboarding');
      renderOnboarding();
    }
    applyFocusMode();
  }

  /** 专注模式：?focus=zone 与 data-focus-zone 对应 */
  function getFocusParam() {
    return new URLSearchParams(location.search).get('focus');
  }

  function resetFocusZones() {
    document.querySelectorAll('[data-focus-zone]').forEach((z) => {
      z.classList.remove('opacity-40', '!opacity-100', 'pointer-events-none', 'relative', 'z-[60]', 'ring-2', 'ring-brand', 'ring-offset-2');
    });
  }

  /** 从试妆返回冷启动时若仍带 focus=toolbar 等，会锁错屏；与当前路由不一致时不应用专注模式 */
  function focusMatchesCurrentRoute(focus, routeHash) {
    const h = routeHash || 'onboarding';
    const arOnly = ['camera', 'hints', 'advice', 'toolbar'];
    const onboardingOnly = ['onboarding'];
    if (h === 'ar') {
      if (onboardingOnly.includes(focus)) return false;
    } else {
      if (arOnly.includes(focus)) return false;
    }
    return true;
  }

  /** 内部跳转回冷启动时去掉 focus，避免 URL 残留导致无法点选 */
  function stripFocusParamFromUrl() {
    try {
      const u = new URL(location.href);
      if (!u.searchParams.has('focus')) return;
      u.searchParams.delete('focus');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  function applyFocusMode() {
    const focus = getFocusParam();
    const zones = document.querySelectorAll('[data-focus-zone]');
    const h = hashScreen() || 'onboarding';

    if (!focus || !focusMatchesCurrentRoute(focus, h)) {
      resetFocusZones();
      return;
    }
    zones.forEach((z) => {
      const id = z.getAttribute('data-focus-zone');
      const match = id === focus;
      z.classList.toggle('opacity-40', !match);
      z.classList.toggle('pointer-events-none', !match);
      z.classList.toggle('relative', match);
      z.classList.toggle('z-[60]', match);
      z.classList.toggle('ring-2', match);
      z.classList.toggle('ring-brand', match);
      z.classList.toggle('ring-offset-2', match);
      if (match) z.classList.add('!opacity-100');
      else z.classList.remove('!opacity-100');
    });
  }

  /* 冷启动：随机演示「系统推测年龄」 */
  function fakeAgeGuess() {
    const opts = ['26–35 岁', '46–55 岁', '36–45 岁'];
    el('age-guess-val').textContent = opts[Math.floor(Math.random() * opts.length)];
  }

  /* Chips */
  document.querySelectorAll('#chips-occasion .chip').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#chips-occasion .chip').forEach((x) => {
        x.classList.remove('border-brand', 'bg-brand/5', 'text-brand-dark');
        x.classList.add('border-stone-200');
      });
      b.classList.add('border-brand', 'bg-brand/5', 'text-brand-dark');
      b.classList.remove('border-stone-200');
      state.occasion = b.dataset.value;
      saveState();
      renderOnboarding();
    });
  });
  document.querySelectorAll('#chips-age .chip').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#chips-age .chip').forEach((x) => {
        x.classList.remove('border-brand', 'bg-brand/5', 'text-brand-dark');
        x.classList.add('border-stone-200');
      });
      b.classList.add('border-brand', 'bg-brand/5', 'text-brand-dark');
      b.classList.remove('border-stone-200');
      state.age = b.dataset.value;
      saveState();
      renderOnboarding();
    });
  });
  document.querySelectorAll('.rel-chip').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.rel-chip').forEach((x) => {
        x.classList.remove('border-brand', 'bg-brand/5', 'ring-2', 'ring-brand/30');
        x.classList.add('border-stone-200');
      });
      b.classList.add('border-brand', 'bg-brand/5', 'ring-2', 'ring-brand/30');
      b.classList.remove('border-stone-200');
      state.relation = b.dataset.value;
      saveState();
      renderOnboarding();
    });
  });

  el('btn-onb-next').addEventListener('click', () => {
    if (!canProceed()) return;
    if (state.step < 3) {
      state.step++;
      if (state.step === 2) fakeAgeGuess();
      saveState();
      renderOnboarding();
    } else {
      saveState();
      setHash('ar');
    }
  });
  el('btn-onb-prev').addEventListener('click', () => {
    if (state.step > 1) {
      state.step--;
      saveState();
      renderOnboarding();
    }
  });

  el('btn-back').addEventListener('click', () => {
    stripFocusParamFromUrl();
    setHash('onboarding');
  });
  el('btn-reonboard').addEventListener('click', () => {
    state.step = 1;
    saveState();
    stripFocusParamFromUrl();
    setHash('onboarding');
  });
  el('btn-save-compare').addEventListener('click', () => showToast('已保存至相册（演示）：对比图默认仅本地存储'));

  el('btn-info').addEventListener('click', () => {
    el('modal-privacy').classList.remove('hidden');
    el('modal-privacy').classList.add('flex');
  });
  el('modal-privacy-close').addEventListener('click', () => {
    el('modal-privacy').classList.add('hidden');
    el('modal-privacy').classList.remove('flex');
  });

  el('privacy-dismiss').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const b = el('privacy-banner');
    b.classList.add('hidden');
    b.setAttribute('aria-hidden', 'true');
    sessionStorage.setItem(STORAGE_KEY + '_privacy_ok', '1');
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('load', () => {
    loadState();
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo === 'ar' || demo === 'ar_self') {
      state = {
        step: 3,
        occasion: 'party',
        age: '26-35',
        relation: demo === 'ar_self' ? 'self' : 'elder',
        lookId: DEFAULT_LOOK_ID,
        lookStrength: {},
      };
      ensureLookStrength();
      saveState();
      location.hash = 'ar';
    } else if (!location.hash || location.hash === '#') {
      location.hash = 'onboarding';
    }
    route();
    if (!sessionStorage.getItem(STORAGE_KEY + '_privacy_ok')) {
      const b = el('privacy-banner');
      b.classList.remove('hidden');
      b.removeAttribute('aria-hidden');
    }
    /* 恢复已选 chips 视觉 */
    if (state.occasion) {
      const o = document.querySelector('#chips-occasion .chip[data-value="' + state.occasion + '"]');
      if (o) o.click();
    }
    if (state.age) {
      const a = document.querySelector('#chips-age .chip[data-value="' + state.age + '"]');
      if (a) a.click();
    }
    if (state.relation) {
      const r = document.querySelector('.rel-chip[data-value="' + state.relation + '"]');
      if (r) r.click();
    }
    renderOnboarding();
  });
