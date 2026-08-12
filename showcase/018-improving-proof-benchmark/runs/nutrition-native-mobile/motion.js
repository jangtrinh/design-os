/* global gsap */
const shutter = document.querySelector('#shutter');
const captureState = document.querySelector('#capture-state');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (window.gsap && !reduce) {
  gsap.timeline({ defaults: { ease: 'power3.out' } }).from('header', { opacity: 0, y: -16 }).from('.phone-primary', { opacity: 0, y: 80, rotateX: -6, duration: 1 }, '-=.3').from('.phone-secondary', { opacity: 0, x: (index) => index ? 80 : -80, duration: .9, stagger: .12 }, '-=.7');
  gsap.to('.scan-line', { top: '78%', duration: 2.1, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  gsap.to('.food-tag', { y: -5, duration: 1.8, repeat: -1, yoyo: true, stagger: .25, ease: 'sine.inOut' });
}
shutter?.addEventListener('click', () => {
  captureState.textContent = 'Analyzing portions';
  if (!window.gsap || reduce) { captureState.textContent = 'Meal understood'; return; }
  gsap.timeline().to('.shutter span', { scale: .72, duration: .12 }).to('.camera-image', { filter: 'brightness(1.7)', duration: .08 }).to('.camera-image', { filter: 'brightness(1)', duration: .25 }).to('.shutter span', { scale: 1, backgroundColor: '#d8f05d', duration: .35, ease: 'back.out(2)' }).add(() => { captureState.textContent = 'Meal understood'; });
});
