(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------
     Nav: solid surface + border once the page has scrolled
     ---------------------------------------------------------- */
  var nav = document.getElementById("site-nav");
  function onScroll() {
    if (window.scrollY > 8) {
      nav.classList.add("is-scrolled");
    } else {
      nav.classList.remove("is-scrolled");
    }
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ----------------------------------------------------------
     Mobile menu toggle — a disclosure nav with real open/close
     state: Escape closes it, a click outside closes it, closing
     always returns focus to the trigger, and it can't be left
     open behind an already-visible desktop nav after a resize.
     ---------------------------------------------------------- */
  var toggle = document.getElementById("nav-toggle");
  var menu = document.getElementById("mobile-menu");
  var toggleIcon = document.getElementById("nav-toggle-icon");
  var MOBILE_BREAKPOINT = window.matchMedia("(max-width: 860px)");

  function isMenuOpen() {
    return menu.getAttribute("data-open") === "true";
  }

  function setMenuOpen(open) {
    menu.setAttribute("data-open", String(open));
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggleIcon.setAttribute("href", open ? "#icon-close" : "#icon-menu");
  }

  function closeMenu(returnFocus) {
    if (!isMenuOpen()) return;
    setMenuOpen(false);
    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", function () {
    setMenuOpen(!isMenuOpen());
  });

  menu.addEventListener("click", function (evt) {
    if (evt.target.tagName === "A") closeMenu(false);
  });

  document.addEventListener("keydown", function (evt) {
    if (evt.key === "Escape" && isMenuOpen()) closeMenu(true);
  });

  document.addEventListener("click", function (evt) {
    if (!isMenuOpen()) return;
    var withinMenu = menu.contains(evt.target) || toggle.contains(evt.target);
    if (!withinMenu) closeMenu(false);
  });

  MOBILE_BREAKPOINT.addEventListener("change", function (evt) {
    if (!evt.matches) closeMenu(false); // crossed back to desktop width — never leave it open
  });

  /* ----------------------------------------------------------
     Trial-request form. No backend in scope for this page, so
     "Start a trial" does something real and local instead of
     pointing at a dead href: it validates the email client-side
     and shows an explicit success state. It never claims to send
     anything over the network.
     ---------------------------------------------------------- */
  var trialForm = document.getElementById("trial-form");
  if (trialForm) {
    var trialInput = document.getElementById("trial-email");
    var trialNote = document.getElementById("trial-form-note");

    trialForm.addEventListener("submit", function (evt) {
      evt.preventDefault();
      if (trialForm.classList.contains("is-submitted")) return;

      if (!trialInput.checkValidity()) {
        trialInput.setAttribute("aria-invalid", "true");
        trialNote.textContent = "Enter a work email address to continue.";
        trialNote.setAttribute("data-tone", "error");
        trialInput.focus();
        return;
      }

      trialInput.removeAttribute("aria-invalid");
      trialForm.classList.add("is-submitted");
      trialNote.setAttribute("data-tone", "success");
      trialNote.textContent = "You're on the list — trial access goes to " + trialInput.value + ".";
    });

    trialInput.addEventListener("input", function () {
      if (trialInput.getAttribute("aria-invalid") === "true" && trialInput.checkValidity()) {
        trialInput.removeAttribute("aria-invalid");
        trialNote.textContent = "";
      }
    });
  }

  /* ----------------------------------------------------------
     Scroll-reveal, progressively enhanced.
     Content is fully visible without JS or with reduced motion;
     .js-motion only gets added when both JS runs and motion is
     allowed, so the CSS opacity/transform rules only ever apply
     when they can be safely reversed.
     ---------------------------------------------------------- */
  if (!reduceMotion && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-motion");

    var targets = document.querySelectorAll("[data-reveal]");
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (entry.isIntersecting) {
            var el = entry.target;
            var delay = (i % 6) * 60;
            setTimeout(function () {
              el.classList.add("is-visible");
            }, delay);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }
})();
