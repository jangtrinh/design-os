(function () {
  "use strict";

  var reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Sticky nav scroll state */
  var nav = document.querySelector(".site-nav");
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

  /* Scroll-triggered entrance, staggered per child. Content is visible by
     default in plain CSS (see styles.css [data-reveal]) — nothing here gates
     visibility; this only ARMS a pre-animation state (.motion-ready) and then
     lifts it per-group as each is scrolled near. Reveal timing is driven by a
     direct getBoundingClientRect check on scroll/resize/load rather than
     IntersectionObserver alone, since an observer that never reports (a
     backgrounded tab, a stalled compositor) would otherwise leave content
     armed-and-invisible with no recovery — measurement here is synchronous
     and re-run on every scroll, so it cannot get stuck. A last-resort
     timeout still guarantees every group reveals even if scroll/resize never
     fire again after load. */
  var revealGroups = Array.prototype.slice.call(document.querySelectorAll("[data-reveal-group]"));

  function revealGroup(group) {
    if (group.dataset.revealed === "true") return;
    group.dataset.revealed = "true";
    var children = group.querySelectorAll("[data-reveal]");
    children.forEach(function (child, index) {
      setTimeout(function () {
        child.classList.add("is-visible");
      }, index * 50);
    });
  }

  function revealAllGroups() {
    revealGroups.forEach(revealGroup);
  }

  if (!reduceMotionQuery.matches && revealGroups.length) {
    document.documentElement.classList.add("motion-ready");

    var ticking = false;
    function checkGroups() {
      var viewH = window.innerHeight || document.documentElement.clientHeight;
      revealGroups.forEach(function (group) {
        if (group.dataset.revealed === "true") return;
        var rect = group.getBoundingClientRect();
        if (rect.top < viewH * 0.92 && rect.bottom > 0) {
          revealGroup(group);
        }
      });
      ticking = false;
    }
    function onScrollOrResize() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(checkGroups);
    }

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    checkGroups();

    // Last-resort safety net — content must never stay permanently hidden.
    setTimeout(revealAllGroups, 4000);
  } else {
    revealAllGroups();
  }

  /* Vault-record reveal control — dial-ring turns, masked value cross-fades
     to the specimen plaintext with no layout shift. */
  var revealBtn = document.querySelector("[data-reveal-toggle]");
  var valueEl = document.querySelector("[data-secret-value]");
  if (revealBtn && valueEl) {
    var masked = valueEl.getAttribute("data-masked");
    var revealed = valueEl.getAttribute("data-revealed");
    var label = revealBtn.querySelector("[data-reveal-label]");

    revealBtn.addEventListener("click", function () {
      var isRevealed = revealBtn.getAttribute("aria-pressed") === "true";
      var next = !isRevealed;
      revealBtn.setAttribute("aria-pressed", String(next));
      valueEl.textContent = next ? revealed : masked;
      if (label) {
        label.textContent = next ? "Hide" : "Reveal";
      }
      revealBtn.setAttribute(
        "aria-label",
        next ? "Hide secret value" : "Reveal secret value"
      );
    });
  }
})();
