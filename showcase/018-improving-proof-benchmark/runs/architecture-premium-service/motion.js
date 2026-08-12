/* global gsap, ScrollTrigger */
if (window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)', () => {
    const context = gsap.context(() => {
      gsap.timeline({ defaults: { ease: 'power3.out' } }).from('header', { opacity: 0, y: -20, duration: .8 }).from('.hero-title>*', { opacity: 0, y: 45, duration: 1, stagger: .12 }, '-=.3').from('.hero-meta>*', { opacity: 0, y: 20, stagger: .1 }, '-=.5');
      gsap.to('.hero>img', { scale: 1.13, yPercent: 6, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 } });
      gsap.from('.premise h2', { y: 80, opacity: 0, ease: 'power3.out', scrollTrigger: { trigger: '.premise', start: 'top 70%' } });
      gsap.from('.site-story figure', { clipPath: 'inset(12% 12% 12% 12%)', ease: 'none', scrollTrigger: { trigger: '.site-story', start: 'top 85%', end: 'center center', scrub: .8 } });
      const title = document.querySelector('#journey-title');
      const copy = document.querySelector('#journey-copy');
      const number = document.querySelector('.journey-number');
      gsap.utils.toArray('.journey-images figure').forEach((figure) => {
        ScrollTrigger.create({ trigger: figure, start: 'top center', end: 'bottom center', onEnter: () => updateStory(figure), onEnterBack: () => updateStory(figure) });
        gsap.fromTo(figure.querySelector('img'), { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: figure, start: 'top bottom', end: 'bottom top', scrub: .8 } });
      });
      function updateStory(figure) {
        gsap.timeline().to([title, copy, number], { opacity: 0, y: 14, duration: .2 }).add(() => { title.textContent = figure.dataset.title; copy.textContent = figure.dataset.copy; number.textContent = figure.dataset.step; }).to([title, copy, number], { opacity: 1, y: 0, duration: .45, stagger: .05 });
      }
      gsap.from('.material', { y: 90, opacity: 0, stagger: .15, ease: 'power3.out', scrollTrigger: { trigger: '.material-grid', start: 'top 75%' } });
      gsap.to('.closing>img', { scale: 1.1, ease: 'none', scrollTrigger: { trigger: '.closing', start: 'top bottom', end: 'bottom bottom', scrub: 1 } });
    });
    return () => context.revert();
  });
}
