/* global gsap, ScrollTrigger */
const range = document.querySelector('#compare-range');
const treatment = document.querySelector('#treatment');
const compareLine = document.querySelector('#compare-line');
const compile = document.querySelector('#compile');
const status = document.querySelector('#result-status');

function updateComparison(value) {
  treatment.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  compareLine.style.left = `${value}%`;
}

range?.addEventListener('input', (event) => updateComparison(event.target.value));
compile?.addEventListener('click', () => {
  status.textContent = 'Resolving';
  compile.disabled = true;
  gsap.timeline().to('.decision-grid div', { opacity: 0, y: 12, duration: .18, stagger: .04 })
    .set(status, { textContent: 'Qualified' })
    .to('.decision-grid div', { opacity: 1, y: 0, duration: .45, stagger: .07, ease: 'back.out(1.5)' })
    .set(compile, { disabled: false });
});

if (window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)', () => {
    const context = gsap.context(() => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.nav', { opacity: 0, y: -20, duration: .7 })
        .from('.hero-copy > *', { opacity: 0, y: 30, duration: .8, stagger: .1 }, '-=.35')
        .from('.prompt-lab', { opacity: 0, x: 50, rotate: 1.5, duration: .9 }, '-=.75');
      gsap.to('.hero-ambient span:nth-child(1)', { xPercent: -18, yPercent: 22, duration: 8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.hero-ambient span:nth-child(2)', { xPercent: 25, rotate: 90, duration: 11, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.utils.toArray('.story-stage').forEach((stage) => {
        gsap.from(stage.querySelectorAll('.story-index,.story-body>*'), { opacity: 0, y: 45, stagger: .08, ease: 'power2.out', scrollTrigger: { trigger: stage, start: 'top 78%', end: 'top 42%', scrub: .6 } });
      });
      gsap.from('.comparison', { clipPath: 'inset(18% 18% 18% 18%)', ease: 'none', scrollTrigger: { trigger: '.evidence', start: 'top 80%', end: 'center center', scrub: .8 } });
      gsap.from('.system-feature', { opacity: 0, y: 70, stagger: .12, ease: 'power3.out', scrollTrigger: { trigger: '.system-layout', start: 'top 75%' } });
      gsap.from('.memory-track span', { scaleX: 0, transformOrigin: 'left', stagger: .15, scrollTrigger: { trigger: '.memory-track', start: 'top 85%' } });
    });
    return () => context.revert();
  });
}
