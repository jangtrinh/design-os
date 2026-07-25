(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     Sticky nav — background/border once the page has scrolled
     --------------------------------------------------------- */
  var nav = document.getElementById("nav");
  function updateNavState() {
    if (!nav) return;
    if (window.scrollY > 8) {
      nav.classList.add("is-scrolled");
    } else {
      nav.classList.remove("is-scrolled");
    }
  }
  updateNavState();
  window.addEventListener("scroll", updateNavState, { passive: true });

  /* ---------------------------------------------------------
     Mobile nav disclosure
     --------------------------------------------------------- */
  var menuBtn = document.getElementById("navMenuBtn");
  var mobilePanel = document.getElementById("navMobilePanel");
  var mobileScrim = document.getElementById("navMobileScrim");
  if (menuBtn && mobilePanel && mobileScrim) {
    function openMenu() {
      menuBtn.setAttribute("aria-expanded", "true");
      mobilePanel.removeAttribute("hidden");
      mobileScrim.removeAttribute("hidden");
    }
    function closeMenu(returnFocus) {
      menuBtn.setAttribute("aria-expanded", "false");
      mobilePanel.setAttribute("hidden", "");
      mobileScrim.setAttribute("hidden", "");
      if (returnFocus) { menuBtn.focus(); }
    }
    menuBtn.addEventListener("click", function () {
      var isOpen = menuBtn.getAttribute("aria-expanded") === "true";
      if (isOpen) { closeMenu(false); } else { openMenu(); }
    });
    mobilePanel.addEventListener("click", function (event) {
      if (event.target.tagName === "A") { closeMenu(false); }
    });
    // Outside click: the scrim sits behind the panel and above the
    // rest of the page, so a click on it always means "outside".
    mobileScrim.addEventListener("click", function () { closeMenu(false); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") {
        closeMenu(true);
      }
    });
  }

  /* ---------------------------------------------------------
     Tear-to-reveal control on the hero ticket
     --------------------------------------------------------- */
  var tearBtn = document.getElementById("tearBtn");
  var ticketCard = document.getElementById("ticketCard");
  var valueMasked = ticketCard ? ticketCard.querySelector(".value-masked") : null;
  var valuePlain = ticketCard ? ticketCard.querySelector(".value-plain") : null;
  if (tearBtn && ticketCard && valueMasked && valuePlain) {
    tearBtn.addEventListener("click", function () {
      var isTorn = ticketCard.classList.toggle("is-torn");
      tearBtn.setAttribute("aria-pressed", String(isTorn));
      valueMasked.hidden = isTorn;
      valuePlain.hidden = !isTorn;
    });
  }

  /* ---------------------------------------------------------
     Scroll-entrance reveal.
     Content is visible-by-default in CSS (see [data-reveal] rules) —
     this script only OPTS elements into the pre-animation hidden
     state, and only once it can guarantee something will un-hide
     them again. Never a visibility gate: if this script fails to
     run at all, [data-reveal] elements stay at their default
     visible/opacity:1 state.
     --------------------------------------------------------- */
  if (!reduceMotion) {
    document.documentElement.classList.add("motion-ready");

    var revealTargets = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));

    function isInView(el) {
      var rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
    }

    function checkReveal() {
      revealTargets.forEach(function (el) {
        if (!el.classList.contains("is-visible") && isInView(el)) {
          el.classList.add("is-visible");
        }
      });
      if (revealTargets.every(function (el) { return el.classList.contains("is-visible"); })) {
        window.removeEventListener("scroll", checkReveal);
        window.removeEventListener("resize", checkReveal);
      }
    }

    checkReveal();
    window.addEventListener("scroll", checkReveal, { passive: true });
    window.addEventListener("resize", checkReveal);

    // Safety net: whatever hasn't revealed itself in 4s reveals anyway.
    window.setTimeout(function () {
      revealTargets.forEach(function (el) { el.classList.add("is-visible"); });
    }, 4000);
  }
})();
