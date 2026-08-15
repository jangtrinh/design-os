(function () {
  const slides = Array.from(document.querySelectorAll('.slide-item'));
  const stage = document.getElementById('slideStage');
  const progressBar = document.getElementById('progressBarDeck');
  const notesDrawer = document.getElementById('speakerNotesDrawer');
  const notesText = document.getElementById('speakerNotesText');
  const counterDisplay = document.getElementById('slideCounterDisplay');
  const overviewModal = document.getElementById('overviewModal');
  const overviewGrid = document.getElementById('overviewGrid');
  const totalSlides = slides.length;
  let currentIndex = 0;
  let isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =========================================================
  // 1. Responsive Fit-to-Screen Stage Scaling (Desktop >= 1024px)
  // =========================================================
  function scaleStage() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (viewportWidth < 1024) {
      // Mobile / Tablet Fluid Mode: Remove transform
      stage.style.transform = 'none';
      return;
    }

    const targetWidth = 1920;
    const targetHeight = 1080;

    const scaleX = viewportWidth / targetWidth;
    const scaleY = viewportHeight / targetHeight;
    const scale = Math.min(scaleX, scaleY);

    stage.style.transform = 'scale(' + scale + ')';
  }

  window.addEventListener('resize', scaleStage);
  scaleStage();

  // =========================================================
  // 2. GSAP Slide Entrance Choreography Engine (T5 Motion Tier)
  // =========================================================
  function animateSlideEntrance(slideEl) {
    if (isReducedMotion || typeof gsap === 'undefined') {
      return;
    }

    const reveals = slideEl.querySelectorAll('.gsap-reveal');
    const cards = slideEl.querySelectorAll('.gsap-card');

    const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.5 } });

    if (reveals.length > 0) {
      tl.fromTo(reveals, 
        { y: 20, autoAlpha: 0 }, 
        { y: 0, autoAlpha: 1, stagger: 0.06, clearProps: 'transform' }
      );
    }

    if (cards.length > 0) {
      tl.fromTo(cards, 
        { y: 24, autoAlpha: 0, scale: 0.98 }, 
        { y: 0, autoAlpha: 1, scale: 1, stagger: 0.07, clearProps: 'transform,scale' }, 
        "-=0.25"
      );
    }
  }

  // =========================================================
  // 3. Slide Navigation Logic
  // =========================================================
  function updateSlide(index) {
    if (index < 0) index = 0;
    if (index >= totalSlides) index = totalSlides - 1;
    currentIndex = index;

    slides.forEach((slide, idx) => {
      if (idx === currentIndex) {
        slide.classList.add('active');
        // Update speaker notes
        const notesEl = slide.querySelector('[data-speaker-notes]');
        if (notesText) {
          notesText.textContent = notesEl ? notesEl.getAttribute('data-speaker-notes') : 'No speaker notes for this slide.';
        }
        // Update counter display
        if (counterDisplay) {
          const currentPadded = String(currentIndex + 1).padStart(2, '0');
          const totalPadded = String(totalSlides).padStart(2, '0');
          counterDisplay.textContent = currentPadded + ' / ' + totalPadded;
        }
        // Scroll to top in mobile view
        if (window.innerWidth < 1024) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        // Trigger GSAP entrance choreography
        animateSlideEntrance(slide);
      } else {
        slide.classList.remove('active');
      }
    });

    // Update progress bar
    if (progressBar) {
      const progressPct = ((currentIndex + 1) / totalSlides) * 100;
      progressBar.style.width = progressPct + '%';
    }
  }

  function nextSlide() {
    if (currentIndex < totalSlides - 1) updateSlide(currentIndex + 1);
  }

  function prevSlide() {
    if (currentIndex > 0) updateSlide(currentIndex - 1);
  }

  function toggleNotes() {
    if (notesDrawer) notesDrawer.classList.toggle('open');
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }

  // =========================================================
  // 4. Overview Grid Modal Logic
  // =========================================================
  function renderOverview() {
    if (!overviewGrid) return;
    overviewGrid.innerHTML = '';
    slides.forEach((slide, idx) => {
      const title = slide.querySelector('.slide-title-display, .slide-title-h1');
      const eyebrow = slide.querySelector('.slide-eyebrow');
      const card = document.createElement('div');
      card.className = 'overview-card ' + (idx === currentIndex ? 'current' : '');
      
      const numDiv = document.createElement('div');
      numDiv.style.fontFamily = 'var(--font-mono)';
      numDiv.style.fontSize = '12px';
      numDiv.style.color = 'var(--text-muted)';
      numDiv.style.fontWeight = '700';
      numDiv.textContent = 'SLIDE ' + String(idx + 1).padStart(2, '0');
      
      const titleDiv = document.createElement('div');
      titleDiv.style.fontSize = '15px';
      titleDiv.style.fontWeight = '700';
      titleDiv.style.color = 'var(--text-primary)';
      titleDiv.style.lineHeight = '1.3';
      titleDiv.textContent = title ? title.textContent.trim() : 'Slide ' + (idx + 1);

      const eyeDiv = document.createElement('div');
      eyeDiv.style.fontSize = '13px';
      eyeDiv.style.color = 'var(--text-muted)';
      eyeDiv.textContent = eyebrow ? eyebrow.textContent.trim() : '';

      card.appendChild(numDiv);
      card.appendChild(titleDiv);
      card.appendChild(eyeDiv);

      card.addEventListener('click', () => {
        updateSlide(idx);
        closeOverview();
      });
      overviewGrid.appendChild(card);
    });
  }

  function toggleOverview() {
    if (!overviewModal) return;
    if (overviewModal.classList.contains('open')) {
      closeOverview();
    } else {
      renderOverview();
      overviewModal.classList.add('open');
    }
  }

  function closeOverview() {
    if (overviewModal) overviewModal.classList.remove('open');
  }

  // =========================================================
  // 5. i18n Language Switcher Engine (7 Languages, Default: EN)
  // =========================================================
  const supportedLanguages = [
    { code: 'en', label: 'English (Default)', flag: '🇺🇸' },
    { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'ko', label: '한국어', flag: '🇰🇷' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'zh', label: '中文 (简体)', flag: '🇨🇳' }
  ];

  let currentLang = 'en';
  try {
    const savedLang = localStorage.getItem('deck_lang');
    if (savedLang && supportedLanguages.some(l => l.code === savedLang)) {
      currentLang = savedLang;
    }
  } catch (e) {}

  const langModal = document.getElementById('langModal');
  const langGrid = document.getElementById('langGrid');
  const btnLang = document.getElementById('btn-lang');
  const btnCloseLang = document.getElementById('btnCloseLang');

  function renderLangGrid() {
    if (!langGrid) return;
    langGrid.innerHTML = '';
    supportedLanguages.forEach(lang => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'lang-option ' + (lang.code === currentLang ? 'active' : '');
      opt.setAttribute('data-lang', lang.code);
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'lang-name';
      nameSpan.innerHTML = '<span style="font-size:18px;">' + lang.flag + '</span> <span>' + lang.label + '</span>';

      const codeSpan = document.createElement('span');
      codeSpan.className = 'lang-code';
      codeSpan.textContent = lang.code.toUpperCase();

      opt.appendChild(nameSpan);
      opt.appendChild(codeSpan);

      opt.addEventListener('click', () => {
        setLanguage(lang.code);
        closeLangModal();
      });

      langGrid.appendChild(opt);
    });
  }

  function setLanguage(lang) {
    if (!supportedLanguages.some(l => l.code === lang)) return;
    currentLang = lang;
    try {
      localStorage.setItem('deck_lang', lang);
    } catch (e) {}

    document.documentElement.lang = lang;

    // Update UI elements from translations dictionary
    if (typeof DECK_I18N !== 'undefined') {
      const uiStrings = (DECK_I18N.ui && DECK_I18N.ui[lang]) || (DECK_I18N.ui && DECK_I18N.ui.en);
      if (uiStrings) {
        const brandBadge = document.querySelector('.chrome-header span:first-child');
        const headerVersion = document.querySelector('.chrome-header span:last-child');
        const footerHint = document.querySelector('.chrome-footer span:first-child');

        if (footerHint && uiStrings.footerHint) footerHint.textContent = uiStrings.footerHint;
        if (headerVersion && uiStrings.headerVersion) headerVersion.textContent = uiStrings.headerVersion;

        // Update interactive diagram trigger buttons
        const btnPulseFoundations = document.getElementById('btn-pulse-triad-foundations');
        if (btnPulseFoundations && uiStrings.actFoundations) btnPulseFoundations.textContent = '▷ ' + uiStrings.actFoundations;

        const btnPulseArch = document.getElementById('btn-pulse-arch');
        if (btnPulseArch && uiStrings.actArch) btnPulseArch.textContent = '▷ ' + uiStrings.actArch;

        const btnPulseSoul = document.getElementById('btn-pulse-soul');
        if (btnPulseSoul && uiStrings.actSoul) btnPulseSoul.textContent = '▷ ' + uiStrings.actSoul;

        const btnPulseFigma = document.getElementById('btn-pulse-figma-bridge');
        if (btnPulseFigma && uiStrings.actFigma) btnPulseFigma.textContent = '▷ ' + uiStrings.actFigma;

        const btnPulseAudit = document.getElementById('btn-pulse-audit-surfaces');
        if (btnPulseAudit && uiStrings.actAudit) btnPulseAudit.textContent = '▷ ' + uiStrings.actAudit;

        const btnPulseMemory = document.getElementById('btn-pulse-memory');
        if (btnPulseMemory && uiStrings.actMemory) btnPulseMemory.textContent = '▷ ' + uiStrings.actMemory;

        const btnPulseColor = document.getElementById('btn-pulse-color-gamut');
        if (btnPulseColor && uiStrings.actColor) btnPulseColor.textContent = '▷ ' + uiStrings.actColor;

        const btnPulseTaste = document.getElementById('btn-pulse-taste-radar');
        if (btnPulseTaste && uiStrings.actTaste) btnPulseTaste.textContent = '▷ ' + uiStrings.actTaste;

        const btnPulseCinema = document.getElementById('btn-pulse-scroll-cinema');
        if (btnPulseCinema && uiStrings.actCinema) btnPulseCinema.textContent = '▷ ' + uiStrings.actCinema;

        const btnRunDelivery = document.getElementById('btn-run-delivery-pipeline');
        if (btnRunDelivery && uiStrings.actDelivery) btnRunDelivery.textContent = '▷ ' + uiStrings.actDelivery;
      }

      // Update slide texts for all slides
      if (DECK_I18N.slides) {
        slides.forEach((slide, idx) => {
          const slideNum = idx + 1;
          const slideData = DECK_I18N.slides[slideNum] && (DECK_I18N.slides[slideNum][lang] || DECK_I18N.slides[slideNum].en);
          if (slideData) {
            const eyebrowEl = slide.querySelector('.slide-eyebrow');
            const titleEl = slide.querySelector('.slide-title-display, .slide-title-h1');
            const subtitleEl = slide.querySelector('.slide-subtitle');
            const notesEl = slide.querySelector('[data-speaker-notes]');

            if (eyebrowEl && slideData.eyebrow) eyebrowEl.innerHTML = '• ' + slideData.eyebrow;
            if (titleEl && slideData.title) titleEl.innerHTML = slideData.title;
            if (subtitleEl && slideData.subtitle) subtitleEl.innerHTML = slideData.subtitle;
            if (notesEl && slideData.notes) notesEl.setAttribute('data-speaker-notes', slideData.notes);
          }
        });
      }
    }

    updateSlide(currentIndex);
    renderLangGrid();
  }

  function toggleLangModal() {
    if (!langModal) return;
    if (langModal.classList.contains('open')) {
      closeLangModal();
    } else {
      renderLangGrid();
      langModal.classList.add('open');
    }
  }

  function closeLangModal() {
    if (langModal) langModal.classList.remove('open');
  }

    // =========================================================
  // 6. Meaningful Diagram Craft Interactions & Diagnostic Readouts
  // =========================================================

  function setReadout(slideId, badgeText, message) {
    const panel = document.getElementById('readout-' + slideId);
    if (!panel) return;
    const badge = panel.querySelector('.readout-badge');
    const text = panel.querySelector('.readout-text');
    if (badge && badgeText) badge.textContent = badgeText;
    if (text && message) {
      text.textContent = message;
      if (typeof gsap !== 'undefined' && !isReducedMotion) {
        gsap.fromTo(text, { opacity: 0.3, y: 3 }, { opacity: 1, y: 0, duration: 0.25 });
      }
    }
  }

  // Node details dictionary for meaningful inspection
  const nodeDetails = {
    'nodePillar1': { slide: 'slide-2', badge: 'TRUTH 01 • OKLCH', text: 'OKLCH Math: Uniform perceptual lightness L across 360° hues. Eliminates optical distortion. ΔEOK < 0.02 precision.' },
    'nodePillar2': { slide: 'slide-2', badge: 'TRUTH 02 • BRAIN/BODY', text: 'Division of Labor: AI reasons creative brief & persona. UI Kernel deterministically compiles tokens & runs hard math.' },
    'nodePillar3': { slide: 'slide-2', badge: 'TRUTH 03 • FLOOR', text: 'Deterministic Machine Floor: 14 machine linters block defects, container soup > 2 levels, and a11y violations.' },
    'nodeUser': { slide: 'slide-3', badge: '01 • USER INTENT', text: 'User Intent: High-priority brief providing brand context, reference URLs, and conversion goals.' },
    'nodeAgent': { slide: 'slide-3', badge: '02 • AI BRAIN', text: 'Host AI Agent: Synthesizes layout, picks Design Persona, and writes semantic HTML/CSS without hallucinated tokens.' },
    'nodeKernel': { slide: 'slide-3', badge: '03 • UI KERNEL', text: 'UI Kernel: Compiles DTCG design-tokens, checks WCAG AA contrast, and runs 14 hard linters before artifact release.' },
    'soulFactory': { slide: 'slide-5', badge: 'TIER 0 • FACTORY', text: 'Factory Invariants (Weight 0): Immutable laws — no purple-on-dark, no container soup, strict accessibility floor.' },
    'soulStudio': { slide: 'slide-5', badge: 'TIER 1 • STUDIO', text: 'Studio Standards (Weight 50): Shared workspace conventions — Phosphor icon set, 8px spacing cadence, default typefaces.' },
    'soulProject': { slide: 'slide-5', badge: 'TIER 2 • PROJECT', text: 'Project Soul (Weight 75): Bespoke brand voice — chosen persona (Aurora Minimal), custom tokens, and motion ladder.' },
    'figmaNodeCode': { slide: 'slide-10', badge: 'CODE REPO', text: 'Code Repository: Canonical DTCG design/tokens.json compiled by UI Kernel.' },
    'figmaNodeBroker': { slide: 'slide-10', badge: 'PORT 9410 BROKER', text: 'WebSocket Broker (127.0.0.1:9410): Bi-directional bridge handling conflict locks and atomic token transmissions.' },
    'figmaNodeCanvas': { slide: 'slide-10', badge: 'FIGMA CANVAS', text: 'Figma Desktop Canvas: Live auto-layout frames bound to Native Figma Variables.' },
    'auditQuad1': { slide: 'slide-12', badge: 'QUADRANT 1: TASTE', text: 'ui taste-lint: 6-axis aesthetic floor check (Layout, Typo, Spacing, Icons, Motion, Depth) against 14 anti-patterns.' },
    'auditQuad2': { slide: 'slide-12', badge: 'QUADRANT 2: LAYOUT', text: 'ui validate-layout: Detects container soup (> 2 wrapper levels), horizontal overflow, and grid breakages.' },
    'auditQuad3': { slide: 'slide-12', badge: 'QUADRANT 3: A11Y', text: 'ui a11y-lint: Static Tier-1 accessibility check (WCAG 2.2 contrast, landmark roles, button labels).' },
    'auditQuad4': { slide: 'slide-12', badge: 'QUADRANT 4: FULL AUDIT', text: 'ui vr gate & full-audit: Headless browser rendering, visual regression diffing, and paired-token validation.' },
    'memRecall': { slide: 'slide-14', badge: 'STEP 1: RECALL', text: 'Recall Pass: Embeds task brief via local ONNX vector model, queries past architectural lessons (Cosine Similarity >= 0.85).' },
    'memWork': { slide: 'slide-14', badge: 'STEP 2: WORK', text: 'Work Execution: Host AI executes code generation primed with retrieved historical guidelines.' },
    'memReflect': { slide: 'slide-14', badge: 'STEP 3: REFLECT', text: 'Reflect & Distill: Post-delivery agent extracts lessons and appends structured JSON to .design/memory.json.' },
    'colorHSL': { slide: 'slide-16', badge: 'LEGACY: HSL/sRGB', text: 'HSL Flaw: Yellow at L=50% is 3x brighter to human eye than Blue at L=50%, leading to broken contrast.' },
    'colorOKLCH': { slide: 'slide-16', badge: 'MODERN: OKLCH', text: 'OKLCH Science: Perceptually uniform lightness L. An L=0.7 color has identical perceived brightness across all hues.' },
    'colorDelta': { slide: 'slide-16', badge: 'SEMVER COLOR DELTA', text: 'Delta EOK Precision: ΔEOK > 0.05 triggers Major Semver version bump; ΔEOK <= 0.02 is invisible fine-tuning.' },
    'tasteCore7': { slide: 'slide-17', badge: 'CORE AXIS: CONSISTENCY', text: 'Consistency Core (Weight 2.0): 100% DTCG Token reuse and component registry compliance. Minimum 10/10 required.' },
    'cinemaLeg1': { slide: 'slide-21', badge: 'LEG 1: HERO ORBIT', text: 'Leg 1 (Hero Orbit): Spatial camera rotation around product geometry. Verified 60fps frame rate.' },
    'cinemaLeg2': { slide: 'slide-21', badge: 'LEG 2: EXPLODED VIEW', text: 'Leg 2 (Exploded View): Component disassembly along Z-axis. Seam 1 verifies zero-rewind position lock.' },
    'cinemaLeg3': { slide: 'slide-21', badge: 'LEG 3: MACRO 2K', text: 'Leg 3 (Macro Core): 2K sub-pixel texture zoom. Seam 2 velocity vector match guarantees smooth handoff.' }
  };

  // Wire click on all interactive nodes
  Object.keys(nodeDetails).forEach(id => {
    const el = document.getElementById(id) || document.querySelector(id);
    if (el) {
      el.addEventListener('click', () => {
        const info = nodeDetails[id];
        setReadout(info.slide, info.badge, info.text);

        // Visual active state toggle
        const parentSvg = el.closest('svg');
        if (parentSvg) {
          parentSvg.querySelectorAll('.interactive-node').forEach(n => n.classList.remove('active-node'));
          el.classList.add('active-node');
        }

        if (typeof gsap !== 'undefined' && !isReducedMotion) {
          gsap.fromTo(el, { scale: 0.98 }, { scale: 1.03, duration: 0.2, yoyo: true, repeat: 1, ease: 'power2.out' });
        }
      });
    }
  });

  // Simulation Triggers:

  // 1. Foundations Triad
  const btnPulseFoundations = document.getElementById('btn-pulse-triad-foundations');
  if (btnPulseFoundations) {
    btnPulseFoundations.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline();
      setReadout('slide-2', 'SIMULATION: RUNNING', '[1/3] Validating OKLCH Gamut (Display P3) & Contrast (4.5:1)...');
      tl.to('#nodePillar1', { scale: 1.04, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .call(() => setReadout('slide-2', 'SIMULATION: RUNNING', '[2/3] Verifying AI Reasoning vs UI Kernel Division of Labor...'), null, '+=0.2')
        .to('#nodePillar2', { scale: 1.04, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .call(() => setReadout('slide-2', 'SIMULATION: RUNNING', '[3/3] Executing 14 Deterministic Quality Floor Linters...'), null, '+=0.2')
        .to('#nodePillar3', { scale: 1.04, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .call(() => setReadout('slide-2', 'SIMULATION: COMPLETE', '✓ All 3 Founding Invariants Verified 100% Operational!'), null, '+=0.3');
    });
  }

  // 2. Division of Labor
  const btnPulseArch = document.getElementById('btn-pulse-arch');
  if (btnPulseArch) {
    btnPulseArch.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline();
      setReadout('slide-3', 'DATAFLOW: STEP 1', 'User submits Natural Language Prompt -> Ingested by system.');
      tl.to('#nodeUser', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .to('.svg-packet-1', { scale: 2.2, fill: 'var(--text-primary)', duration: 0.4, yoyo: true, repeat: 2 }, '-=0.1')
        .call(() => setReadout('slide-3', 'DATAFLOW: STEP 2', 'AI Host Agent reasons layout, selects Persona, generates semantic AST...'), null, '+=0.1')
        .to('#nodeAgent', { scale: 1.04, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .to('.svg-packet-2', { scale: 2.2, fill: 'var(--text-primary)', duration: 0.4, yoyo: true, repeat: 2 }, '-=0.1')
        .call(() => setReadout('slide-3', 'DATAFLOW: STEP 3', 'UI Kernel executes OKLCH compilation & 14 linters gate check...'), null, '+=0.1')
        .to('#nodeKernel', { scale: 1.05, duration: 0.35, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .call(() => setReadout('slide-3', 'DATAFLOW: COMPLETE', '✓ Deterministic Pipeline Release: 0 Errors, Qualified Delivery v2!'), null, '+=0.3');
    });
  }

  // 3. Design Soul
  const btnPulseSoul = document.getElementById('btn-pulse-soul');
  if (btnPulseSoul) {
    btnPulseSoul.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      setReadout('slide-5', 'CASCADE: RESOLVING', '1. Factory Invariants (Weight 0) locked: Zero purple-on-dark, Zero container soup.');
      tl.to('#soulFactory', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .call(() => setReadout('slide-5', 'CASCADE: RESOLVING', '2. Studio Standards (Weight 50) inherited: 8px rhythm, Phosphor icons.'), null, '+=0.2')
        .to('#soulStudio', { scale: 1.05, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .call(() => setReadout('slide-5', 'CASCADE: RESOLVING', '3. Project Soul (Weight 75) applied: Aurora Minimal Persona & P3 colors.'), null, '+=0.2')
        .to('#soulProject', { scale: 1.06, duration: 0.35, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .call(() => setReadout('slide-5', 'CASCADE: COMPLETE', '✓ Final Stance: Project Stance Overrides Studio, Factory Invariants Intact!'), null, '+=0.3');
    });
  }

  // 4. Figma Bridge
  const btnPulseFigma = document.getElementById('btn-pulse-figma-bridge');
  if (btnPulseFigma) {
    btnPulseFigma.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      setReadout('slide-10', 'SYNC: CODE -> CANVAS', '1. Code AST compiles DTCG Tokens in design/tokens.json...');
      tl.to('#figmaNodeCode', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .call(() => setReadout('slide-10', 'SYNC: WS 9410 BROKER', '2. WebSocket Broker on port 9410 acquires lock & converts payload...'), null, '+=0.2')
        .to('#figmaNodeBroker', { scale: 1.06, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .call(() => setReadout('slide-10', 'SYNC: FIGMA CANVAS', '3. Figma Plugin generates auto-layout frame & binds Figma Variables live!'), null, '+=0.2')
        .to('#figmaNodeCanvas', { scale: 1.05, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .call(() => setReadout('slide-10', 'SYNC: LIVE ACTIVE', '✓ Bi-directional Sync Active: Zero manual copy-pasting required!'), null, '+=0.3');
    });
  }

  // 5. 4 Audit Surfaces
  const btnPulseAudit = document.getElementById('btn-pulse-audit-surfaces');
  if (btnPulseAudit) {
    btnPulseAudit.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      const quads = [
        { id: '#auditQuad1', name: 'QUADRANT 1', msg: 'Running ui taste-lint: 6-axis aesthetic rubric floor...' },
        { id: '#auditQuad2', name: 'QUADRANT 2', msg: 'Running ui validate-layout: Static container & overflow analysis...' },
        { id: '#auditQuad3', name: 'QUADRANT 3', msg: 'Running ui a11y-lint: Static Tier-1 WCAG contrast & ARIA check...' },
        { id: '#auditQuad4', name: 'QUADRANT 4', msg: 'Running design-os audit & VR Gate: Full 10-tool release suite...' }
      ];
      quads.forEach((q, idx) => {
        tl.call(() => setReadout('slide-12', q.name, q.msg), null, idx === 0 ? 0 : '+=0.25')
          .fromTo(q.id, { scale: 1 }, { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.05');
      });
      tl.call(() => setReadout('slide-12', 'AUDIT: 4/4 PASS', '✓ All 4 Audit Surfaces Clean: 0 Errors, 0 Breaking Violations!'), null, '+=0.3');
    });
  }

  // 6. Memory Loop
  const btnPulseMemory = document.getElementById('btn-pulse-memory');
  if (btnPulseMemory) {
    btnPulseMemory.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
      setReadout('slide-14', 'VECTOR RECALL', '1. Vector Search: Matching task against .design/memory.json (Score: 0.91)...');
      tl.to('#memRecall', { scale: 1.05, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .call(() => setReadout('slide-14', 'WORK CONTEXT', '2. Priming Host AI with 2 relevant historical lessons for execution...'), null, '+=0.2')
        .to('#memWork', { scale: 1.04, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .call(() => setReadout('slide-14', 'DISTILLATION', '3. Post-task Reflection: Distilling 1 new lesson into persistent memory...'), null, '+=0.2')
        .to('#memReflect', { scale: 1.06, duration: 0.35, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .call(() => setReadout('slide-14', 'MEMORY UPDATED', '✓ Memory Loop Closed: Agent learns and never repeats past mistakes!'), null, '+=0.3');
    });
  }

  // 7. Color Science
  const btnPulseColor = document.getElementById('btn-pulse-color-gamut');
  if (btnPulseColor) {
    btnPulseColor.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      setReadout('slide-16', 'COLOR SCIENCE', 'Inspecting HSL Flaw: Yellow L=50% is 3x brighter than Blue L=50%...');
      tl.to('#colorHSL', { opacity: 0.4, duration: 0.25, yoyo: true, repeat: 1 })
        .call(() => setReadout('slide-16', 'OKLCH UNIFORMITY', 'OKLCH ensures identical perceived lightness L=0.7 across all hues.'), null, '+=0.15')
        .to('#colorOKLCH', { scale: 1.06, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.05')
        .call(() => setReadout('slide-16', 'SEMVER DELTA E', 'ΔEOK Distance Check: Measured ΔEOK = 0.012 (< 0.02 Minor Patch Safe).'), null, '+=0.15')
        .to('#colorDelta', { scale: 1.05, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.05')
        .call(() => setReadout('slide-16', 'GAMUT P3 OK', '✓ 100% Display P3 Gamut Coverage with mathematical precision!'), null, '+=0.3');
    });
  }

  // 8. Taste Rubric Radar
  const btnPulseTaste = document.getElementById('btn-pulse-taste-radar');
  if (btnPulseTaste) {
    btnPulseTaste.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      setReadout('slide-17', 'RADAR: SCANNING', 'Evaluating Axis 0: Consistency (DTCG Token & Component Reuse: 10/10)...');
      tl.to('#tasteCore7', { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' });
      const axes = [
        { id: '#tasteAxis1', msg: 'Axis 1: Layout & Hierarchy (Reading order verified: 9.0/10)' },
        { id: '#tasteAxis2', msg: 'Axis 2: Typography & Rhythm (Font hierarchy & tracking: 8.8/10)' },
        { id: '#tasteAxis3', msg: 'Axis 3: Spacing & Geometry (8px token cadence: 9.2/10)' },
        { id: '#tasteAxis4', msg: 'Axis 4: Iconography & Badges (Single icon family: 9.5/10)' },
        { id: '#tasteAxis5', msg: 'Axis 5: Motion Ladder (T5 GSAP choreography: 9.0/10)' },
        { id: '#tasteAxis6', msg: 'Axis 6: Depth & Surfaces (Tonal elevation: 9.0/10)' }
      ];
      axes.forEach((a, idx) => {
        tl.call(() => setReadout('slide-17', 'RADAR: SCANNING', a.msg), null, '+=0.12')
          .fromTo(a.id, { scale: 1 }, { scale: 1.05, duration: 0.2, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.04');
      });
      tl.call(() => setReadout('slide-17', 'SCORE: 9.2 / 10', '✓ 6+1 Taste Rubric Passed: Far exceeds Quality Floor threshold (>= 8.0)!'), null, '+=0.3');
    });
  }

  // 9. Scroll-Cinema
  const btnPulseCinema = document.getElementById('btn-pulse-scroll-cinema');
  if (btnPulseCinema) {
    btnPulseCinema.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      setReadout('slide-21', 'FLIGHT: LEG 1', 'Camera Leg 1: Hero 3D Spatial Orbit (Position: (0, 0, 800))...');
      tl.to('#cinemaLeg1', { scale: 1.05, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .call(() => setReadout('slide-21', 'SEAM 1 VERIFIED', 'Seam 1 Check: Position Delta = 0px -> Seamless Leg 2 Exploded View transition.'), null, '+=0.15')
        .to('#cinemaLeg2', { scale: 1.07, duration: 0.35, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.05')
        .call(() => setReadout('slide-21', 'SEAM 2 VERIFIED', 'Seam 2 Check: Velocity Vector Match 100% -> Smooth Leg 3 Macro 2K handoff.'), null, '+=0.15')
        .to('#cinemaLeg3', { scale: 1.05, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.05')
        .call(() => setReadout('slide-21', 'ONE-TAKE CINEMA', '✓ Continuous Scroll-Cinema: Zero Rewind Stutter across all 3 legs!'), null, '+=0.3');
    });
  }

  // 10. Delivery Pipeline
  const btnRunDelivery = document.getElementById('btn-run-delivery-pipeline');
  if (btnRunDelivery) {
    btnRunDelivery.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const steps = [
        { id: '#pipeStep1', label: '1. FLOW LINT', msg: 'Step 1: ui flow lint validated reachability & dead ends.' },
        { id: '#pipeStep2', label: '2. USER EVIDENCE', msg: 'Step 2: ui evidence validated qualitative & quant metrics.' },
        { id: '#pipeStep3', label: '3. VR BASELINE', msg: 'Step 3: ui vr baseline rendered 100% match across 3 viewports.' },
        { id: '#pipeStep4', label: '4. PAIRED TOKENS', msg: 'Step 4: Dark/Light mode paired token consistency confirmed.' },
        { id: '#pipeStep5', label: '5. A11Y LINT', msg: 'Step 5: ui a11y-lint passed static Tier-1 WCAG 2.2 AA.' },
        { id: '#pipeStep6', label: '6. FULL AUDIT', msg: 'Step 6: design-os audit 10-tool suite clean: Ready to Ship!' }
      ];
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      steps.forEach((step, idx) => {
        tl.call(() => setReadout('slide-25', step.label, step.msg), null, idx === 0 ? 0 : '+=0.18')
          .fromTo(step.id, 
            { scale: 1, stroke: 'var(--border-strong)' }, 
            { scale: 1.06, stroke: 'var(--text-primary)', duration: 0.22, yoyo: true, repeat: 1, transformOrigin: 'center' }, 
            '+=0.04'
          );
      });
      tl.call(() => setReadout('slide-25', 'QUALIFIED SHIP', '✓ 6-Step Delivery Pipeline Cleared: 0 Blockers, Production Ready!'), null, '+=0.3');
    });
  }

// Hover feedback on diagram nodes
  const interactiveNodes = [
    '#nodePillar1', '#nodePillar2', '#nodePillar3', '#nodeUser', '#nodeAgent', '#nodeKernel',
    '#soulFactory', '#soulStudio', '#soulProject', '#figmaNodeCode', '#figmaNodeBroker', '#figmaNodeCanvas',
    '#auditQuad1', '#auditQuad2', '#auditQuad3', '#auditQuad4', '#memRecall', '#memWork', '#memReflect',
    '#colorHSL', '#colorOKLCH', '#colorDelta', '#tasteCore7', '#tasteAxis1', '#tasteAxis2', '#tasteAxis3', '#tasteAxis4', '#tasteAxis5', '#tasteAxis6',
    '#cinemaLeg1', '#cinemaLeg2', '#cinemaLeg3'
  ];

  interactiveNodes.forEach(id => {
    const el = document.querySelector(id);
    if (el) {
      el.addEventListener('mouseenter', () => {
        if (!isReducedMotion && typeof gsap !== 'undefined') {
          gsap.to(el, { y: -4, duration: 0.2, ease: 'power2.out' });
        }
      });
      el.addEventListener('mouseleave', () => {
        if (!isReducedMotion && typeof gsap !== 'undefined') {
          gsap.to(el, { y: 0, duration: 0.2, ease: 'power2.out' });
        }
      });
    }
  });

  // =========================================================
  // 7. Event Listeners (Controls & Keyboard)
  // =========================================================
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnTheme = document.getElementById('btn-theme');
  const btnNotes = document.getElementById('btn-notes');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const btnOverview = document.getElementById('btn-overview');
  const btnCloseOv = document.getElementById('btnCloseOverview');

  if (btnPrev) btnPrev.addEventListener('click', prevSlide);
  if (btnNext) btnNext.addEventListener('click', nextSlide);
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);
  if (btnNotes) btnNotes.addEventListener('click', toggleNotes);
  if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);
  if (btnOverview) btnOverview.addEventListener('click', toggleOverview);
  if (btnCloseOv) btnCloseOv.addEventListener('click', closeOverview);
  if (btnLang) btnLang.addEventListener('click', toggleLangModal);
  if (btnCloseLang) btnCloseLang.addEventListener('click', closeLangModal);

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
      case 'PageDown':
        e.preventDefault();
        nextSlide();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault();
        prevSlide();
        break;
      case 'Home':
        e.preventDefault();
        updateSlide(0);
        break;
      case 'End':
        e.preventDefault();
        updateSlide(totalSlides - 1);
        break;
      case 's':
      case 'S':
        toggleNotes();
        break;
      case 't':
      case 'T':
        toggleTheme();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'o':
      case 'O':
        toggleOverview();
        break;
      case 'l':
      case 'L':
        toggleLangModal();
        break;
      case 'Escape':
        closeOverview();
        closeLangModal();
        break;
    }
  });

  // =========================================================
  // 8. Initial Boot
  // =========================================================
  window.deck = { updateSlide, nextSlide, prevSlide, setLanguage, toggleNotes, toggleTheme };
  setLanguage(currentLang);
  updateSlide(0);
})();