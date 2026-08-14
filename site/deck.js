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
  // 6. Interactive GSAP Micro-Choreography Triggers on Diagrams
  // =========================================================
  const btnPulseFoundations = document.getElementById('btn-pulse-triad-foundations');
  if (btnPulseFoundations) {
    btnPulseFoundations.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline();
      tl.to('#nodePillar1', { scale: 1.04, duration: 0.22, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .to('.svg-packet-1', { scale: 2.2, fill: 'var(--text-primary)', duration: 0.3, yoyo: true, repeat: 2 }, '-=0.1')
        .to('#nodePillar2', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '-=0.1')
        .to('#nodePillar3', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '-=0.1');
    });
  }

  const btnPulseArch = document.getElementById('btn-pulse-arch');
  if (btnPulseArch) {
    btnPulseArch.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline();
      tl.to('#nodeUser', { scale: 1.04, duration: 0.2, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .to('#nodeAgent', { scale: 1.03, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '-=0.1')
        .to('#nodeKernel', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '-=0.1');
    });
  }

  const btnPulseSoul = document.getElementById('btn-pulse-soul');
  if (btnPulseSoul) {
    btnPulseSoul.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      tl.to('#soulFactory', { scale: 1.03, duration: 0.2, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .to('#soulStudio', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .to('#soulProject', { scale: 1.06, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1');
    });
  }

  const btnPulseFigma = document.getElementById('btn-pulse-figma-bridge');
  if (btnPulseFigma) {
    btnPulseFigma.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      tl.to('#figmaNodeCode', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .to('#figmaNodeBroker', { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.05')
        .to('#figmaNodeCanvas', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.05');
    });
  }

  const btnPulseAudit = document.getElementById('btn-pulse-audit-surfaces');
  if (btnPulseAudit) {
    btnPulseAudit.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      const quads = ['#auditQuad1', '#auditQuad2', '#auditQuad3', '#auditQuad4'];
      quads.forEach((quad, idx) => {
        tl.fromTo(quad, 
          { scale: 1 }, 
          { scale: 1.03, duration: 0.22, yoyo: true, repeat: 1, transformOrigin: 'center' }, 
          idx === 0 ? 0 : '+=0.08'
        );
      });
    });
  }

  const btnPulseMemory = document.getElementById('btn-pulse-memory');
  if (btnPulseMemory) {
    btnPulseMemory.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
      tl.to('#memRecall', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .to('#memWork', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1')
        .to('#memReflect', { scale: 1.06, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.1');
    });
  }

  const btnPulseColor = document.getElementById('btn-pulse-color-gamut');
  if (btnPulseColor) {
    btnPulseColor.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      tl.to('#colorHSL', { opacity: 0.4, duration: 0.2, yoyo: true, repeat: 1 })
        .to('#colorOKLCH', { scale: 1.05, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.05')
        .to('#colorDelta', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.05');
    });
  }

  const btnPulseTaste = document.getElementById('btn-pulse-taste-radar');
  if (btnPulseTaste) {
    btnPulseTaste.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      tl.to('#tasteCore7', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' });
      const axes = ['#tasteAxis1', '#tasteAxis2', '#tasteAxis3', '#tasteAxis4', '#tasteAxis5', '#tasteAxis6'];
      axes.forEach((axis, idx) => {
        tl.fromTo(axis, 
          { scale: 1 }, 
          { scale: 1.04, duration: 0.2, yoyo: true, repeat: 1, transformOrigin: 'center' }, 
          idx === 0 ? '-=0.1' : '+=0.06'
        );
      });
    });
  }

  const btnPulseCinema = document.getElementById('btn-pulse-scroll-cinema');
  if (btnPulseCinema) {
    btnPulseCinema.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      tl.to('#cinemaLeg1', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' })
        .to('#cinemaLeg2', { scale: 1.06, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.08')
        .to('#cinemaLeg3', { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: 'center' }, '+=0.08');
    });
  }

  const btnRunDelivery = document.getElementById('btn-run-delivery-pipeline');
  if (btnRunDelivery) {
    btnRunDelivery.addEventListener('click', () => {
      if (typeof gsap === 'undefined') return;
      const steps = ['#pipeStep1', '#pipeStep2', '#pipeStep3', '#pipeStep4', '#pipeStep5', '#pipeStep6'];
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      steps.forEach((step, idx) => {
        tl.fromTo(step, 
          { scale: 1, stroke: 'var(--border-strong)' }, 
          { scale: 1.05, stroke: 'var(--text-primary)', duration: 0.22, yoyo: true, repeat: 1, transformOrigin: 'center' }, 
          idx === 0 ? 0 : '+=0.08'
        );
      });
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
  setLanguage(currentLang);
  updateSlide(0);
})();