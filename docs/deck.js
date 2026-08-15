(function () {
  // 1. DOM Element Cache
  const slides = Array.from(document.querySelectorAll('.slide-item'));
  const stage = document.getElementById('slideStage');
  const progressBar = document.getElementById('progressBarDeck');
  const notesDrawer = document.getElementById('speakerNotesDrawer');
  const notesText = document.getElementById('speakerNotesText');
  const counterDisplay = document.getElementById('slideCounterDisplay');
  const overviewModal = document.getElementById('overviewModal');
  const overviewGrid = document.getElementById('overviewGrid');
  const langModal = document.getElementById('langModal');
  const langGrid = document.getElementById('langGrid');

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnOverview = document.getElementById('btn-overview');
  const btnLang = document.getElementById('btn-lang');
  const btnNotes = document.getElementById('btn-notes');
  const btnTheme = document.getElementById('btn-theme');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const btnCloseLang = document.getElementById('btnCloseLang');

  const totalSlides = slides.length;
  let currentIndex = 0;

  // =========================================================
  // 2. Responsive Fit-to-Screen Stage Scaling
  // =========================================================
  function scaleStage() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (viewportWidth < 1024) {
      if (stage) stage.style.transform = 'none';
      return;
    }

    const targetWidth = 1920;
    const targetHeight = 1080;

    const scaleX = viewportWidth / targetWidth;
    const scaleY = viewportHeight / targetHeight;
    const scale = Math.min(scaleX, scaleY);

    if (stage) stage.style.transform = 'scale(' + scale + ')';
  }

  window.addEventListener('resize', scaleStage);
  scaleStage();

  // =========================================================
  // 3. Instant Slide Navigation (Zero Animation)
  // =========================================================
  function updateSlide(index) {
    if (index < 0) index = 0;
    if (index >= totalSlides) index = totalSlides - 1;
    currentIndex = index;

    slides.forEach((slide, idx) => {
      if (idx === currentIndex) {
        slide.classList.add('active');
        const notesEl = slide.querySelector('[data-speaker-notes]');
        if (notesText) {
          notesText.textContent = notesEl ? notesEl.getAttribute('data-speaker-notes') : 'No speaker notes for this slide.';
        }
        if (counterDisplay) {
          const currentPadded = String(currentIndex + 1).padStart(2, '0');
          const totalPadded = String(totalSlides).padStart(2, '0');
          counterDisplay.textContent = currentPadded + ' / ' + totalPadded;
        }
        if (window.innerWidth < 1024) {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      } else {
        slide.classList.remove('active');
      }
    });

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

  // =========================================================
  // 4. Speaker Notes Drawer
  // =========================================================
  function toggleNotes() {
    if (notesDrawer) notesDrawer.classList.toggle('open');
  }

  // =========================================================
  // 5. Theme Toggle (Light / Dark)
  // =========================================================
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    try {
      localStorage.setItem('design-os-theme', newTheme);
    } catch (e) {}
  }

  try {
    const savedTheme = localStorage.getItem('design-os-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  } catch (e) {}

  // =========================================================
  // 6. Fullscreen Toggle
  // =========================================================
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  // =========================================================
  // 7. Overview Modal Grid
  // =========================================================
  function toggleOverview() {
    if (!overviewModal) return;
    if (overviewModal.classList.contains('open')) {
      closeOverview();
    } else {
      renderOverviewGrid();
      overviewModal.classList.add('open');
    }
  }

  function closeOverview() {
    if (overviewModal) overviewModal.classList.remove('open');
  }

  function renderOverviewGrid() {
    if (!overviewGrid) return;
    overviewGrid.innerHTML = '';
    slides.forEach((slide, index) => {
      const titleEl = slide.querySelector('.radiant-display-title, .slide-title-display, .slide-title-h1');
      const titleText = titleEl ? (titleEl.innerHTML.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim()) : 'Slide ' + (index + 1);
      const card = document.createElement('div');
      card.className = 'overview-card' + (index === currentIndex ? ' active' : '');
      card.innerHTML = '<div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">SLIDE ' + String(index + 1).padStart(2, '0') + '</div><div style="font-weight: 700; font-size: 14px; color: var(--text-primary); line-height: 1.3;">' + titleText + '</div>';
      card.addEventListener('click', () => {
        updateSlide(index);
        closeOverview();
      });
      overviewGrid.appendChild(card);
    });
  }

  // =========================================================
  // 8. i18n Multi-Language Engine (7 Languages, Default: EN)
  // =========================================================
    const supportedLanguages = [
    { code: 'en', label: 'English (Default)' },
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'ko', label: '한국어' },
    { code: 'ja', label: '日本語' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'zh', label: '中文 (简体)' }
  ];

  let currentLang = 'en';
  try {
    const savedLang = localStorage.getItem('deck_lang');
    if (savedLang && supportedLanguages.some(l => l.code === savedLang)) {
      currentLang = savedLang;
    }
  } catch (e) {}

  function renderLangGrid() {
    if (!langGrid) return;
    langGrid.innerHTML = '';
    supportedLanguages.forEach(lang => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'lang-option' + (lang.code === currentLang ? ' active' : '');
      opt.setAttribute('data-lang', lang.code);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'lang-name';
      nameSpan.innerHTML = '<span class="lang-icon"><i class="ph ph-globe"></i></span> <span>' + lang.label + '</span>';

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

    if (typeof DECK_I18N !== 'undefined' && DECK_I18N.slides) {
      slides.forEach((slide, idx) => {
        const slideNum = String(idx + 1);
        const slideData = DECK_I18N.slides[slideNum] && (DECK_I18N.slides[slideNum][lang] || DECK_I18N.slides[slideNum].en);
        if (slideData) {
          const eyebrowEl = slide.querySelector('.slide-eyebrow');
          const titleEl = slide.querySelector('.radiant-display-title, .slide-title-display, .slide-title-h1');
          const subtitleEl = slide.querySelector('.slide-subtitle');
          const notesEl = slide.querySelector('[data-speaker-notes]');

          const radTitle = slide.querySelector('.radiant-display-title');
          const radBody = slide.querySelector('.radiant-body-text');
          const radHeroNum = slide.querySelector('.radiant-hero-number');
          const radHeroLabel = slide.querySelector('.radiant-hero-label');
          if (radTitle && slideData.title) radTitle.innerHTML = slideData.title;
          if (radBody && (slideData.body || slideData.subtitle)) radBody.innerHTML = slideData.body || slideData.subtitle;
          if (radHeroNum && slideData.heroNum) radHeroNum.textContent = slideData.heroNum;
          if (radHeroLabel && slideData.heroLabel) radHeroLabel.textContent = slideData.heroLabel;

          if (titleEl && slideData.title) titleEl.innerHTML = slideData.title;
          if (subtitleEl && (slideData.subtitle || slideData.body)) subtitleEl.innerHTML = slideData.subtitle || slideData.body;
          if (notesEl && slideData.notes) notesEl.setAttribute('data-speaker-notes', slideData.notes);
        }
      });
    }

    updateSlide(currentIndex);
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
  // 9. Architecture Readout Panel Registry
  // =========================================================
  function setReadout(slideId, badgeText, descriptionText) {
    const slide = document.getElementById(slideId);
    if (!slide) return;
    const badge = slide.querySelector('.readout-badge');
    const text = slide.querySelector('.readout-text');
    if (badge) badge.textContent = badgeText;
    if (text) text.textContent = descriptionText;
  }

  const nodeDetails = {
    // Slide 2
    'nodePillar1': { slide: 'slide-2', badge: 'TRUTH 1: OKLCH', text: 'OKLCH Color Math: Perceptual uniformity across all 360 hues in Display P3 gamut. Zero arbitrary hex.' },
    'nodePillar2': { slide: 'slide-2', badge: 'TRUTH 2: DIVISION', text: 'Division of Labor: AI Host Agent handles creative reasoning; deterministic UI Kernel compiles tokens & enforces linters.' },
    'nodePillar3': { slide: 'slide-2', badge: 'TRUTH 3: QUALITY FLOOR', text: 'Deterministic Machine Floor: 14 static linters verify layout, a11y, and taste. Exit 0 required to release.' },

    // Slide 3
    'nodeUser': { slide: 'slide-3', badge: 'ORGAN 1: TRANSMITTER', text: 'Human Intent Beacon: Natural language prompt specifying brand, mood, and target audience.' },
    'nodeAgent': { slide: 'slide-3', badge: 'ORGAN 2: NEURAL PRISM', text: 'Host AI Agent: Creative synthesis reasoning, resolving persona families, and structuring semantic DOM.' },
    'nodeKernel': { slide: 'slide-3', badge: 'ORGAN 3: MONOLITH GATE', text: 'UI Kernel Engine: Deterministic execution of OKLCH math, DTCG tokens, and 14 linting suites with 0 stochastic code.' },

    // Slide 5
    'soulFactory': { slide: 'slide-5', badge: 'TIER 0: FACTORY (WT 0)', text: 'Factory Invariants (Immutable): Banned anti-patterns (no purple-on-dark, no container soup > 2). Absolute floor.' },
    'soulStudio': { slide: 'slide-5', badge: 'TIER 1: STUDIO (WT 50)', text: 'Studio Standards: Workspace shared conventions (8px spacing grid, default iconography, typography base).' },
    'soulProject': { slide: 'slide-5', badge: 'TIER 2: PROJECT (WT 75)', text: 'Project Soul (Highest Precedence): Bespoke brand persona and token overrides. Project brief wins.' },

    // Slide 10
    'figmaNodeCode': { slide: 'slide-10', badge: 'WEST BANK: CODE', text: 'Code Repository: Single source of truth in design/tokens.json compiled to CSS variables and semantic AST.' },
    'figmaNodeBroker': { slide: 'slide-10', badge: 'WS BROKER: 9410', text: 'figma-agent WebSocket Broker on 127.0.0.1:9410: Bi-directional synchronization with atomic mutex locking.' },
    'figmaNodeCanvas': { slide: 'slide-10', badge: 'EAST BANK: CANVAS', text: 'Live Figma Desktop Canvas: Native Figma Variables and Auto-Layout frames syncing in real time.' },

    // Slide 12
    'auditQuad1': { slide: 'slide-12', badge: 'SURFACE 1: TASTE LINT', text: 'ui taste-lint: Fast static check for 14 banned anti-patterns and 6-axis aesthetic rubric floor.' },
    'auditQuad2': { slide: 'slide-12', badge: 'SURFACE 2: LAYOUT', text: 'ui validate-layout: Structural analysis preventing container soup > 2 and horizontal overflow.' },
    'auditQuad3': { slide: 'slide-12', badge: 'SURFACE 3: A11Y', text: 'ui a11y-lint: Static WCAG 2.2 AA floor check for ARIA attributes, image alt tags, and focus order.' },
    'auditQuad4': { slide: 'slide-12', badge: 'SURFACE 4: FULL AUDIT', text: 'design-os audit: Comprehensive release gate combining all 10 tools and visual regression baselines.' },

    // Slide 14
    'memRecall': { slide: 'slide-14', badge: 'STEP 1: VECTOR RECALL', text: 'Recall Query: Scans incoming brief against local ONNX vector space for cosine similarity >= 0.85.' },
    'memWork': { slide: 'slide-14', badge: 'STEP 2: WORK EXECUTION', text: 'Primed Synthesis: Host agent executes generation pass informed by distilled lessons, avoiding regressions.' },
    'memReflect': { slide: 'slide-14', badge: 'STEP 3: REFLECT & DISTILL', text: 'Crucible Distillation: Post-generation reflection freezes new lessons into .design/memory.json.' },

    // Slide 16
    'colorHSL': { slide: 'slide-16', badge: 'LEGACY HSL FLAW', text: 'HSL Non-Linearity: Yellow at L=50% is 3x brighter than Blue at L=50%, distorting optical contrast.' },
    'colorOKLCH': { slide: 'slide-16', badge: 'OKLCH UNIFORMITY', text: 'OKLCH Standard: Constant perceived lightness across all hues in 100% Display P3 wide gamut.' },
    'colorDelta': { slide: 'slide-16', badge: 'DELTA E SEMVER', text: 'Delta EOK Precision: Math-backed Semver (Delta E > 0.05 Major, Delta E <= 0.02 Patch).' },

    // Slide 17
    'tasteCore7': { slide: 'slide-17', badge: 'CORE: CONSISTENCY', text: 'Consistency Core 0: 100% design token binding and component registry reuse across all screens.' },
    'tasteAxis1': { slide: 'slide-17', badge: 'AXIS 1: LAYOUT', text: 'Layout & Hierarchy: Clear reading order, no container soup, fluid responsiveness across breakpoints.' },
    'tasteAxis2': { slide: 'slide-17', badge: 'AXIS 2: TYPOGRAPHY', text: 'Typography & Rhythm: Modular type scale, calibrated line-height, and precise tracking.' },
    'tasteAxis3': { slide: 'slide-17', badge: 'AXIS 3: SPACING', text: 'Spacing & Geometry: Strict 8px spatial rhythm and harmonized corner radii tokens.' },
    'tasteAxis4': { slide: 'slide-17', badge: 'AXIS 4: ICONOGRAPHY', text: 'Iconography: Single curated icon family with uniform stroke weight and semantic sizes.' },
    'tasteAxis5': { slide: 'slide-17', badge: 'AXIS 5: MOTION', text: 'Motion Ladder: Purpose-driven choreography strictly bounded by reduced-motion accessibility.' },
    'tasteAxis6': { slide: 'slide-17', badge: 'AXIS 6: DEPTH', text: 'Depth & Surfaces: Tonal elevation and polarized optical contrast instead of muddy drop shadows.' },

    // Slide 21
    'cinemaLeg1': { slide: 'slide-21', badge: 'LEG 1: HERO ORBIT', text: 'Leg 1 (Hero Orbit): Spatial camera rotation around product geometry at 60fps.' },
    'cinemaLeg2': { slide: 'slide-21', badge: 'LEG 2: EXPLODED VIEW', text: 'Leg 2 (Exploded View): Internal component separation along Z-axis. Seam 1 locks position.' },
    'cinemaLeg3': { slide: 'slide-21', badge: 'LEG 3: MACRO 2K', text: 'Leg 3 (Macro Core): 2K sub-pixel texture dive. Seam 2 velocity vector match guarantees smooth handoff.' },

    // Slide 25
    'pipeStep1': { slide: 'slide-25', badge: 'STAGE 1: FLOW', text: 'ui flow lint: Multi-screen state machine validation catching dead ends and unhandled error states.' },
    'pipeStep2': { slide: 'slide-25', badge: 'STAGE 2: EVIDENCE', text: 'ui evidence: Verifies research grounding and user problem-solution alignment.' },
    'pipeStep3': { slide: 'slide-25', badge: 'STAGE 3: VR GATE', text: 'ui vr gate: Visual regression baseline verification across Desktop, Laptop, and Mobile viewports.' },
    'pipeStep4': { slide: 'slide-25', badge: 'STAGE 4: PAIRS', text: 'ui paired-tokens: Validates paired dark and light mode tokens preventing orphan color references.' },
    'pipeStep5': { slide: 'slide-25', badge: 'STAGE 5: A11Y', text: 'ui a11y-lint: Static Tier-1 accessibility check enforcing WCAG 2.2 AA contrast and ARIA labels.' },
    'pipeStep6': { slide: 'slide-25', badge: 'STAGE 6: AUDIT', text: 'design-os audit: Full 10-tool release suite required to produce zero errors before merge.' }
  };

  Object.keys(nodeDetails).forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        const info = nodeDetails[id];
        setReadout(info.slide, info.badge, info.text);

        const parentSvg = el.closest('svg');
        if (parentSvg) {
          parentSvg.querySelectorAll('.interactive-node').forEach(n => n.classList.remove('active-node'));
          el.classList.add('active-node');
        }
      });
    }
  });

  // =========================================================
  // 10. Event Listeners (Controls & Keyboard)
  // =========================================================
  if (btnPrev) btnPrev.addEventListener('click', prevSlide);
  if (btnNext) btnNext.addEventListener('click', nextSlide);
  if (btnOverview) btnOverview.addEventListener('click', toggleOverview);
  if (btnLang) btnLang.addEventListener('click', toggleLangModal);
  if (btnCloseLang) btnCloseLang.addEventListener('click', closeLangModal);
  if (btnNotes) btnNotes.addEventListener('click', toggleNotes);
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);
  if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        nextSlide();
        break;
      case 'ArrowLeft':
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
      case 'n':
      case 'N':
        toggleNotes();
        break;
      case 'o':
      case 'O':
        toggleOverview();
        break;
      case 't':
      case 'T':
        toggleTheme();
        break;
      case 'l':
      case 'L':
        toggleLangModal();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'Escape':
        closeOverview();
        closeLangModal();
        break;
    }
  });

  // Close modals on clicking backdrop
  if (langModal) {
    langModal.addEventListener('click', (e) => {
      if (e.target === langModal) closeLangModal();
    });
  }

  if (overviewModal) {
    overviewModal.addEventListener('click', (e) => {
      if (e.target === overviewModal) closeOverview();
    });
  }

  // =========================================================
  // 11. Initial Boot & API Export
  // =========================================================
  setLanguage(currentLang);
  updateSlide(0);

  
  // =========================================================
  // 12. Liquid Gooey Physics Engine (Inspired by Jakub Antalik)
  // Cross-browser SVG filter morphing, elastic rubber physics & viscous UI
  // =========================================================
  const navOverlay = document.querySelector('.nav-overlay');
  const navLiquidBlob = document.getElementById('navLiquidBlob');
  const navButtons = document.querySelectorAll('.nav-btn');

  if (navOverlay && navLiquidBlob) {
    navButtons.forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        const btnRect = btn.getBoundingClientRect();
        const navRect = navOverlay.getBoundingClientRect();
        const relativeLeft = btnRect.left - navRect.left;
        const relativeTop = btnRect.top - navRect.top;

        navLiquidBlob.style.left = relativeLeft + 'px';
        navLiquidBlob.style.top = relativeTop + 'px';
        navLiquidBlob.style.width = btnRect.width + 'px';
        navLiquidBlob.style.height = btnRect.height + 'px';
        navLiquidBlob.classList.add('visible');

        navButtons.forEach(b => b.classList.remove('gooey-active'));
        btn.classList.add('gooey-active');
      });
    });

    navOverlay.addEventListener('mouseleave', () => {
      navLiquidBlob.classList.remove('visible');
      navButtons.forEach(b => b.classList.remove('gooey-active'));
    });
  }

  // Interactive Liquid Tabs & Satellite Widget Helpers
  function initLiquidShowcase() {
    const tabContainers = document.querySelectorAll('.liquid-tabs-wrap');
    tabContainers.forEach(wrap => {
      const pill = wrap.querySelector('.liquid-tab-pill');
      const tabs = wrap.querySelectorAll('.liquid-tab-btn');
      if (!pill || tabs.length === 0) return;

      function updatePill(activeTab) {
        const tabRect = activeTab.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        pill.style.left = (tabRect.left - wrapRect.left) + 'px';
        pill.style.width = tabRect.width + 'px';
      }

      const initialActive = wrap.querySelector('.liquid-tab-btn.active') || tabs[0];
      if (initialActive) {
        initialActive.classList.add('active');
        updatePill(initialActive);
      }

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          updatePill(tab);
        });
      });
    });

    // Satellite Core Toggle
    const satStages = document.querySelectorAll('.liquid-satellite-stage');
    satStages.forEach(stage => {
      const core = stage.querySelector('.liquid-sat-core');
      if (core) {
        core.addEventListener('click', () => {
          stage.classList.toggle('open');
        });
      }
    });
  }

  initLiquidShowcase();

  window.deck = {
    updateSlide,
    nextSlide,
    prevSlide,
    toggleNotes,
    toggleTheme,
    toggleOverview,
    toggleLangModal,
    setLanguage
  };
})();
