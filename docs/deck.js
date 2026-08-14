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

      // 1. Responsive Fit-to-Screen Stage Scaling (1920x1080)
      function scaleStage() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const targetWidth = 1920;
        const targetHeight = 1080;

        const scaleX = viewportWidth / targetWidth;
        const scaleY = viewportHeight / targetHeight;
        const scale = Math.min(scaleX, scaleY);

        stage.style.transform = `scale(\${scale})`;
      }

      window.addEventListener('resize', scaleStage);
      scaleStage();

      // 2. GSAP Slide Entrance Choreography Engine (T5 Motion Tier)
      function animateSlideEntrance(slideEl) {
        if (isReducedMotion || typeof gsap === 'undefined') {
          return;
        }

        const reveals = slideEl.querySelectorAll('.gsap-reveal');
        const cards = slideEl.querySelectorAll('.gsap-card');

        const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.6 } });

        if (reveals.length > 0) {
          tl.fromTo(reveals, 
            { y: 24, autoAlpha: 0 }, 
            { y: 0, autoAlpha: 1, stagger: 0.08, clearProps: 'transform' }
          );
        }

        if (cards.length > 0) {
          tl.fromTo(cards, 
            { y: 32, autoAlpha: 0, scale: 0.98 }, 
            { y: 0, autoAlpha: 1, scale: 1, stagger: 0.09, clearProps: 'transform,scale' }, 
            "-=0.3"
          );
        }
      }

      // 3. Slide Navigation Logic
      function updateSlide(index) {
        if (index < 0) index = 0;
        if (index >= totalSlides) index = totalSlides - 1;
        currentIndex = index;

        slides.forEach((slide, idx) => {
          if (idx === currentIndex) {
            slide.classList.add('active');
            // Update speaker notes
            const notesEl = slide.querySelector('[data-speaker-notes]');
            notesText.textContent = notesEl ? notesEl.getAttribute('data-speaker-notes') : 'Không có ghi chú diễn giả cho slide này.';
            // Update counter display
            if (counterDisplay) {
              const currentPadded = String(currentIndex + 1).padStart(2, '0');
              const totalPadded = String(totalSlides).padStart(2, '0');
              counterDisplay.textContent = `\${currentPadded} / \${totalPadded}`;
            }
            // Trigger GSAP entrance choreography
            animateSlideEntrance(slide);
          } else {
            slide.classList.remove('active');
          }
        });

        // Update progress bar
        const progressPct = ((currentIndex + 1) / totalSlides) * 100;
        progressBar.style.width = progressPct + '%';
      }

      function nextSlide() {
        if (currentIndex < totalSlides - 1) updateSlide(currentIndex + 1);
      }

      function prevSlide() {
        if (currentIndex > 0) updateSlide(currentIndex - 1);
      }

      function toggleNotes() {
        notesDrawer.classList.toggle('open');
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

      // Overview Grid
      function renderOverview() {
        overviewGrid.innerHTML = '';
        slides.forEach((slide, idx) => {
          const title = slide.querySelector('.slide-title-display, .slide-title-h1');
          const eyebrow = slide.querySelector('.slide-eyebrow');
          const card = document.createElement('div');
          card.className = `overview-card \${idx === currentIndex ? 'current' : ''}`;
          card.innerHTML = `
            <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); font-weight: 700;">SLIDE \${String(idx + 1).padStart(2, '0')}</div>
            <div style="font-size: 15px; font-weight: 700; color: var(--text-primary); line-height: 1.3;">\${title ? title.textContent.trim() : 'Slide ' + (idx + 1)}</div>
            <div style="font-size: 13px; color: var(--text-muted);">\${eyebrow ? eyebrow.textContent.trim() : ''}</div>
          `;
          card.addEventListener('click', () => {
            updateSlide(idx);
            closeOverview();
          });
          overviewGrid.appendChild(card);
        });
      }

      function toggleOverview() {
        if (overviewModal.classList.contains('open')) {
          closeOverview();
        } else {
          renderOverview();
          overviewModal.classList.add('open');
        }
      }

      function closeOverview() {
        overviewModal.classList.remove('open');
      }

      // 4. Interactive GSAP Micro-Choreography Triggers on Diagrams
      // A: Slide 2 - Foundations Triad Trigger
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

      // B: Slide 3 - Architecture Data Flow
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

      // C: Slide 5 - Soul Hierarchy Precedence Trigger
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

      // D: Slide 10 - Figma Bridge Bi-directional Trigger
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

      // E: Slide 12 - 4 Audit Surfaces Matrix Trigger
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

      // F: Slide 14 - Memory Loop Simulation
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

      // G: Slide 16 - Color Science Space Simulation
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

      // H: Slide 17 - 6+1 Taste Rubric Craft Radar Runner
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

      // I: Slide 21 - Scroll-Cinema 3-Leg Simulation
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

      // J: Slide 25 - 6-Step Delivery Pipeline Runner
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

      // 5. Event Listeners (Controls & Keyboard)
      document.getElementById('btn-prev').addEventListener('click', prevSlide);
      document.getElementById('btn-next').addEventListener('click', nextSlide);
      document.getElementById('btn-theme').addEventListener('click', toggleTheme);
      document.getElementById('btn-notes').addEventListener('click', toggleNotes);
      document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
      document.getElementById('btn-overview').addEventListener('click', toggleOverview);
      document.getElementById('btnCloseOverview').addEventListener('click', closeOverview);

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
          case 'Escape':
            closeOverview();
            break;
        }
      });

      // Initial view setup
      updateSlide(0);
    })();