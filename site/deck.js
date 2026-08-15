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

  // =========================================================
  // 1. Responsive Fit-to-Screen Stage Scaling (Desktop >= 1024px)
  // =========================================================
  function scaleStage() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (viewportWidth < 1024) {
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
  // 2. Instant, Pure-Layout Slide Navigation (Zero Animation Lag)
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

  function toggleNotes() {
    if (notesDrawer) notesDrawer.classList.toggle('open');
  }

  function toggleOverview() {
    if (!overviewModal) return;
    const isOpen = overviewModal.classList.contains('open');
    if (isOpen) {
      overviewModal.classList.remove('open');
    } else {
      renderOverviewGrid();
      overviewModal.classList.add('open');
    }
  }

  function renderOverviewGrid() {
    if (!overviewGrid) return;
    overviewGrid.innerHTML = '';
    slides.forEach((slide, index) => {
      const titleEl = slide.querySelector('.slide-title-h1');
      const titleText = titleEl ? titleEl.textContent : 'Slide ' + (index + 1);
      const card = document.createElement('div');
      card.className = 'overview-card' + (index === currentIndex ? ' active' : '');
      card.innerHTML = '<div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">SLIDE ' + String(index + 1).padStart(2, '0') + '</div><div style="font-weight: 700; font-size: 14px; color: var(--text-primary); line-height: 1.3;">' + titleText + '</div>';
      card.addEventListener('click', () => {
        updateSlide(index);
        overviewModal.classList.remove('open');
      });
      overviewGrid.appendChild(card);
    });
  }

  // =========================================================
  // 3. Meaningful Architecture Readout Panel Registry
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
    // Slide 2: Foundations Triad
    'nodePillar1': { slide: 'slide-2', badge: 'TRUTH 1: OKLCH', text: 'OKLCH Color Math: Perceptual uniformity across all 360 hues in Display P3 gamut. Zero arbitrary hex.' },
    'nodePillar2': { slide: 'slide-2', badge: 'TRUTH 2: DIVISION', text: 'Division of Labor: AI Host Agent handles creative reasoning; deterministic UI Kernel compiles tokens & enforces linters.' },
    'nodePillar3': { slide: 'slide-2', badge: 'TRUTH 3: QUALITY FLOOR', text: 'Deterministic Machine Floor: 14 static linters verify layout, a11y, and taste. Exit 0 required to release.' },

    // Slide 3: Division of Labor
    'nodeUser': { slide: 'slide-3', badge: 'ORGAN 1: TRANSMITTER', text: 'Human Intent Beacon: Natural language prompt specifying brand, mood, and target audience.' },
    'nodeAgent': { slide: 'slide-3', badge: 'ORGAN 2: NEURAL PRISM', text: 'Host AI Agent: Creative synthesis reasoning, resolving persona families, and structuring semantic DOM.' },
    'nodeKernel': { slide: 'slide-3', badge: 'ORGAN 3: MONOLITH GATE', text: 'UI Kernel Engine: Deterministic execution of OKLCH math, DTCG tokens, and 14 linting suites with 0 stochastic code.' },

    // Slide 5: Design Soul
    'soulFactory': { slide: 'slide-5', badge: 'TIER 0: FACTORY (WT 0)', text: 'Factory Invariants (Immutable): Banned anti-patterns (no purple-on-dark, no container soup > 2). Absolute floor.' },
    'soulStudio': { slide: 'slide-5', badge: 'TIER 1: STUDIO (WT 50)', text: 'Studio Standards: Workspace shared conventions (8px spacing grid, default iconography, typography base).' },
    'soulProject': { slide: 'slide-5', badge: 'TIER 2: PROJECT (WT 75)', text: 'Project Soul (Highest Precedence): Bespoke brand persona and token overrides. Project brief wins.' },

    // Slide 10: Figma Bridge
    'figmaNodeCode': { slide: 'slide-10', badge: 'WEST BANK: CODE', text: 'Code Repository: Single source of truth in design/tokens.json compiled to CSS variables and semantic AST.' },
    'figmaNodeBroker': { slide: 'slide-10', badge: 'WS BROKER: 9410', text: 'figma-agent WebSocket Broker on 127.0.0.1:9410: Bi-directional synchronization with atomic mutex locking.' },
    'figmaNodeCanvas': { slide: 'slide-10', badge: 'EAST BANK: CANVAS', text: 'Live Figma Desktop Canvas: Native Figma Variables and Auto-Layout frames syncing in real time.' },

    // Slide 12: 4 Audit Surfaces
    'auditQuad1': { slide: 'slide-12', badge: 'SURFACE 1: TASTE LINT', text: 'ui taste-lint: Fast static check for 14 banned anti-patterns and 6-axis aesthetic rubric floor.' },
    'auditQuad2': { slide: 'slide-12', badge: 'SURFACE 2: LAYOUT', text: 'ui validate-layout: Structural analysis preventing container soup > 2 and horizontal overflow.' },
    'auditQuad3': { slide: 'slide-12', badge: 'SURFACE 3: A11Y', text: 'ui a11y-lint: Static WCAG 2.2 AA floor check for ARIA attributes, image alt tags, and focus order.' },
    'auditQuad4': { slide: 'slide-12', badge: 'SURFACE 4: FULL AUDIT', text: 'design-os audit: Comprehensive release gate combining all 10 tools and visual regression baselines.' },

    // Slide 14: Design Memory Loop
    'memRecall': { slide: 'slide-14', badge: 'STEP 1: VECTOR RECALL', text: 'Recall Query: Scans incoming brief against local ONNX vector space for cosine similarity >= 0.85.' },
    'memWork': { slide: 'slide-14', badge: 'STEP 2: WORK EXECUTION', text: 'Primed Synthesis: Host agent executes generation pass informed by distilled lessons, avoiding regressions.' },
    'memReflect': { slide: 'slide-14', badge: 'STEP 3: REFLECT & DISTILL', text: 'Crucible Distillation: Post-generation reflection freezes new lessons into .design/memory.json.' },

    // Slide 16: Color Science
    'colorHSL': { slide: 'slide-16', badge: 'LEGACY HSL FLAW', text: 'HSL Non-Linearity: Yellow at L=50% is 3x brighter than Blue at L=50%, distorting optical contrast.' },
    'colorOKLCH': { slide: 'slide-16', badge: 'OKLCH UNIFORMITY', text: 'OKLCH Standard: Constant perceived lightness across all hues in 100% Display P3 wide gamut.' },
    'colorDelta': { slide: 'slide-16', badge: 'DELTA E SEMVER', text: 'Delta EOK Precision: Math-backed Semver (Delta E > 0.05 Major, Delta E <= 0.02 Patch).' },

    // Slide 17: Taste Radar
    'tasteCore7': { slide: 'slide-17', badge: 'CORE: CONSISTENCY', text: 'Consistency Core 0: 100% design token binding and component registry reuse across all screens.' },
    'tasteAxis1': { slide: 'slide-17', badge: 'AXIS 1: LAYOUT', text: 'Layout & Hierarchy: Clear reading order, no container soup, fluid responsiveness across breakpoints.' },
    'tasteAxis2': { slide: 'slide-17', badge: 'AXIS 2: TYPOGRAPHY', text: 'Typography & Rhythm: Modular type scale, calibrated line-height, and precise tracking.' },
    'tasteAxis3': { slide: 'slide-17', badge: 'AXIS 3: SPACING', text: 'Spacing & Geometry: Strict 8px spatial rhythm and harmonized corner radii tokens.' },
    'tasteAxis4': { slide: 'slide-17', badge: 'AXIS 4: ICONOGRAPHY', text: 'Iconography: Single curated icon family with uniform stroke weight and semantic sizes.' },
    'tasteAxis5': { slide: 'slide-17', badge: 'AXIS 5: MOTION', text: 'Motion Ladder: Purpose-driven choreography strictly bounded by reduced-motion accessibility.' },
    'tasteAxis6': { slide: 'slide-17', badge: 'AXIS 6: DEPTH', text: 'Depth & Surfaces: Tonal elevation and polarized optical contrast instead of muddy drop shadows.' },

    // Slide 21: Scroll-Cinema
    'cinemaLeg1': { slide: 'slide-21', badge: 'LEG 1: HERO ORBIT', text: 'Leg 1 (Hero Orbit): Spatial camera rotation around product geometry at 60fps.' },
    'cinemaLeg2': { slide: 'slide-21', badge: 'LEG 2: EXPLODED VIEW', text: 'Leg 2 (Exploded View): Internal component separation along Z-axis. Seam 1 locks position.' },
    'cinemaLeg3': { slide: 'slide-21', badge: 'LEG 3: MACRO 2K', text: 'Leg 3 (Macro Core): 2K sub-pixel texture dive. Seam 2 velocity vector match guarantees smooth handoff.' },

    // Slide 25: Delivery Pipeline
    'pipeStep1': { slide: 'slide-25', badge: 'STAGE 1: FLOW', text: 'ui flow lint: Multi-screen state machine validation catching dead ends and unhandled error states.' },
    'pipeStep2': { slide: 'slide-25', badge: 'STAGE 2: EVIDENCE', text: 'ui evidence: Verifies research grounding and user problem-solution alignment.' },
    'pipeStep3': { slide: 'slide-25', badge: 'STAGE 3: VR GATE', text: 'ui vr gate: Visual regression baseline verification across Desktop, Laptop, and Mobile viewports.' },
    'pipeStep4': { slide: 'slide-25', badge: 'STAGE 4: PAIRS', text: 'ui paired-tokens: Validates paired dark and light mode tokens preventing orphan color references.' },
    'pipeStep5': { slide: 'slide-25', badge: 'STAGE 5: A11Y', text: 'ui a11y-lint: Static Tier-1 accessibility check enforcing WCAG 2.2 AA contrast and ARIA labels.' },
    'pipeStep6': { slide: 'slide-25', badge: 'STAGE 6: AUDIT', text: 'design-os audit: Full 10-tool release suite required to produce zero errors before merge.' }
  };

  // Wire instant click on all interactive nodes
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
  // 4. Keyboard Shortcuts
  // =========================================================
  document.addEventListener('keydown', (e) => {
    // Ignore if focus is in an input or modal
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      nextSlide();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'Home') {
      e.preventDefault();
      updateSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      updateSlide(totalSlides - 1);
    } else if (e.key.toLowerCase() === 'n') {
      toggleNotes();
    } else if (e.key.toLowerCase() === 'o') {
      toggleOverview();
    } else if (e.key.toLowerCase() === 't') {
      toggleTheme();
    } else if (e.key.toLowerCase() === 'f') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    } else if (e.key.toLowerCase() === 'l') {
      if (typeof window.toggleLangMenu === 'function') window.toggleLangMenu();
    }
  });

  // UI Control Buttons
  const btnNext = document.getElementById('btnNextSlide');
  const btnPrev = document.getElementById('btnPrevSlide');
  const btnNotes = document.getElementById('btnToggleNotes');
  const btnOverview = document.getElementById('btnToggleOverview');
  const btnTheme = document.getElementById('btnToggleTheme');
  const btnFullscreen = document.getElementById('btnToggleFullscreen');

  if (btnNext) btnNext.addEventListener('click', nextSlide);
  if (btnPrev) btnPrev.addEventListener('click', prevSlide);
  if (btnNotes) btnNotes.addEventListener('click', toggleNotes);
  if (btnOverview) btnOverview.addEventListener('click', toggleOverview);
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('design-os-theme', newTheme);
  }

  const savedTheme = localStorage.getItem('design-os-theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  // Initialize first slide
  updateSlide(0);

  // Exposed API
  window.deck = {
    updateSlide,
    nextSlide,
    prevSlide,
    toggleNotes,
    toggleTheme,
    setLanguage: (lang) => {
      if (typeof window.applyLanguage === 'function') window.applyLanguage(lang);
    }
  };
})();
