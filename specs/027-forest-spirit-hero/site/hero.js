(function () {
  'use strict';

  var hero = document.querySelector('[data-hero]');
  var stage = document.querySelector('[data-stage]');
  if (!hero || !stage || window.innerWidth < 1024) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    hero.classList.add('is-reduced');
    return;
  }
  if (!window.gsap || !window.ScrollTrigger) {
    hero.classList.add('no-motion');
    return;
  }

  var params = new URLSearchParams(window.location.search);
  var checkpointValues = [0, 0.1, 0.23, 0.38, 0.48, 0.58, 0.68, 0.86, 0.94, 1];
  var progressValue = params.get('progress');
  var requested = progressValue === null ? NaN : Number(progressValue);
  var fixedProgress = checkpointValues.includes(requested) ? requested : null;
  var debug = params.get('debug') === '1';
  var output = hero.querySelector('[data-debug-progress]');
  var beats = {
    eyebrow: hero.querySelector('[data-beat="eyebrow"]'),
    titleOne: hero.querySelector('[data-beat="title-one"]'),
    titleTwo: hero.querySelector('[data-beat="title-two"]'),
    revealCopy: hero.querySelector('[data-beat="reveal-copy"]'),
    cta: hero.querySelector('[data-beat="cta"]')
  };
  var plane = function (name) { return hero.querySelector('[data-plane="' + name + '"]'); };
  var far = plane('far-world');
  var rear = plane('rear-atmosphere');
  var focus = plane('focus-group');
  var haze = plane('near-haze');
  var canopy = plane('canopy-arch');
  var obstruction = plane('right-obstruction');
  var sill = plane('near-sill');
  var behind = plane('spirit-behind');
  var front = plane('spirit-front');
  var gsap = window.gsap;

  gsap.registerPlugin(window.ScrollTrigger);
  gsap.set([far, rear, focus, haze, canopy, obstruction, sill], { transformOrigin: '68% 75%', force3D: true });
  gsap.set([behind, front], { transformOrigin: '76% 48%', force3D: true });
  gsap.set(beats.eyebrow, { autoAlpha: 1, y: 0 });
  gsap.set([beats.titleOne, beats.titleTwo, beats.revealCopy, beats.cta], { autoAlpha: 0, y: 18 });
  gsap.set(obstruction, { x: 190 });
  gsap.set(behind, { autoAlpha: 1, x: -740, y: -94, scale: 0.72 });
  gsap.set(front, { autoAlpha: 0, x: -740, y: -94, scale: 0.72 });

  var timeline = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  timeline
    .addLabel('threshold', 0)
    .set(behind, { autoAlpha: 1, x: -740, y: -94, scale: 0.72 }, 0)
    .set(front, { autoAlpha: 0, x: -740, y: -94, scale: 0.72 }, 0)
    .to(beats.eyebrow, { autoAlpha: 1, y: 0, duration: 0.04 }, 0.02)
    .to([far, rear, focus, haze, canopy, obstruction, sill], { duration: 0.1 }, 0)
    .addLabel('notice', 0.1)
    .to(far, { scale: 1.01, x: -2, duration: 0.13 }, 'notice')
    .to(rear, { scale: 1.02, x: -3, autoAlpha: 0.72, duration: 0.13 }, 'notice')
    .to(focus, { scale: 1.025, x: -6, y: 2, duration: 0.13 }, 'notice')
    .to(behind, { x: -700, y: -66, scale: 0.76, duration: 0.08 }, 'notice')
    .to(behind, { x: -735, y: -36, scale: 0.72, duration: 0.05 }, 'notice+=0.08')
    .to(beats.titleOne, { autoAlpha: 1, y: 0, duration: 0.06 }, 'notice+=0.03')
    .addLabel('crossing', 0.23)
    .to([far, rear], { scale: 1.022, x: -7, duration: 0.15 }, 'crossing')
    .to(focus, { scale: 1.055, x: -16, y: 5, duration: 0.15 }, 'crossing')
    .to([canopy, sill], { scale: 1.09, x: -16, duration: 0.15 }, 'crossing')
    .to(obstruction, { scale: 1.09, x: 190, duration: 0.15 }, 'crossing')
    .to(behind, { x: -210, y: -242, scale: 1.22, duration: 0.11, ease: 'power3.in' }, 'crossing')
    .to(beats.titleTwo, { autoAlpha: 1, y: 0, duration: 0.05 }, 'crossing+=0.04')
    .to([beats.eyebrow, beats.titleOne, beats.titleTwo], { autoAlpha: 0, y: -12, duration: 0.04 }, 'crossing+=0.11')
    .addLabel('absence', 0.38)
    .set(behind, { autoAlpha: 0 }, 'absence')
    .to(behind, { x: -40, y: -92, scale: 1.04, duration: 0.04 }, 'absence')
    .to(obstruction, { autoAlpha: 1, x: 190, scale: 1.125, duration: 0.1 }, 'absence')
    .to(rear, { autoAlpha: 0.42, duration: 0.08 }, 'absence')
    .addLabel('reveal', 0.48)
    .to(far, { scale: 1.033, x: -12, duration: 0.2 }, 'reveal')
    .to(rear, { scale: 1.045, x: -16, autoAlpha: 0.92, duration: 0.2 }, 'reveal')
    .to(focus, { scale: 1.085, x: -29, y: 5, duration: 0.2 }, 'reveal')
    .to(haze, { scale: 1.06, x: -22, autoAlpha: 0.22, duration: 0.2 }, 'reveal')
    .to(canopy, { scale: 1.15, x: -25, duration: 0.2 }, 'reveal')
    .to(obstruction, { scale: 1.12, x: 720, autoAlpha: 0.68, duration: 0.2 }, 'reveal')
    .to(sill, { scale: 1.19, x: -28, y: 14, duration: 0.2 }, 'reveal')
    .to(behind, { autoAlpha: 1, x: -180, y: -200, scale: 0.9, duration: 0.12 }, 'reveal+=0.04')
    .to(beats.revealCopy, { autoAlpha: 1, y: 0, duration: 0.08 }, 'reveal+=0.1')
    .addLabel('orbit', 0.68)
    .set(behind, { autoAlpha: 0 }, 'orbit')
    .set(front, { autoAlpha: 1, x: -180, y: -200, scale: 0.9 }, 'orbit')
    .to(front, { x: 0, y: 0, scale: 1, duration: 0.18, ease: 'power1.out' }, 'orbit')
    .to(beats.cta, { autoAlpha: 1, y: 0, duration: 0.06 }, 'orbit+=0.08')
    .addLabel('settle', 0.86)
    .to([far, rear], { scale: 1.04, x: -14, duration: 0.08 }, 'settle')
    .to(focus, { scale: 1.1, x: -31, y: 5, duration: 0.08 }, 'settle')
    .to(canopy, { scale: 1.18, x: -27, duration: 0.08 }, 'settle')
    .to(sill, { scale: 1.26, x: -31, y: 18, duration: 0.08 }, 'settle')
    .to(obstruction, { x: 760, autoAlpha: 0.5, duration: 0.08 }, 'settle')
    .addLabel('release', 0.94)
    .to(stage, { autoAlpha: 0.98, duration: 0.06 }, 'release');

  hero.classList.add('motion-ready');
  if (debug) hero.querySelector('[data-debug]').hidden = false;
  if (fixedProgress !== null) {
    timeline.progress(fixedProgress).pause();
    if (output) output.value = fixedProgress.toFixed(2);
    return;
  }
  window.ScrollTrigger.create({
    id: 'forest-spirit-master', trigger: hero, pin: stage, start: 'top top', end: '+=420%', scrub: 0.35,
    animation: timeline, invalidateOnRefresh: true, markers: debug,
    onUpdate: function (self) { if (output) output.value = self.progress.toFixed(2); }
  });
}());
