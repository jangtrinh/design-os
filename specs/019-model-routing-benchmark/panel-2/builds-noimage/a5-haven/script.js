(function () {
  "use strict";

  var reducedMotionQuery = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var prefersReducedMotion = !!(reducedMotionQuery && reducedMotionQuery.matches);

  /* ---- sticky nav gains a solid background only after scroll ---- */
  var nav = document.getElementById("site-nav");
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

  /* ---- mobile nav toggle: Escape, outside-click, and breakpoint-reset all close it ---- */
  var navToggle = document.getElementById("nav-toggle");
  var navPanel = document.getElementById("nav-panel");
  var navToggleIcon = document.getElementById("nav-toggle-icon");

  function closeNavPanel(returnFocus) {
    if (!navPanel || !navPanel.classList.contains("is-open")) return;
    navPanel.classList.remove("is-open");
    if (navToggle) {
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Open menu");
    }
    if (navToggleIcon) navToggleIcon.setAttribute("href", "#i-menu");
    if (returnFocus && navToggle) navToggle.focus();
  }

  if (navToggle && navPanel) {
    navToggle.addEventListener("click", function () {
      var isOpen = navPanel.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
      if (navToggleIcon) navToggleIcon.setAttribute("href", isOpen ? "#i-close" : "#i-menu");
    });

    navPanel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { closeNavPanel(false); });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && navPanel.classList.contains("is-open")) {
        closeNavPanel(true);
      }
    });

    document.addEventListener("click", function (event) {
      if (!navPanel.classList.contains("is-open")) return;
      var target = event.target;
      if (navPanel.contains(target) || navToggle.contains(target)) return;
      closeNavPanel(false);
    });

    var lastAboveBreakpoint = window.innerWidth > 768;
    window.addEventListener("resize", function () {
      var aboveBreakpoint = window.innerWidth > 768;
      if (aboveBreakpoint !== lastAboveBreakpoint) {
        closeNavPanel(false);
        lastAboveBreakpoint = aboveBreakpoint;
      }
    });
  }

  /* ---- scroll-reveal entrance ----
     Content is visible by default in the markup/CSS. Only when JS is present
     AND motion is allowed do we arm the pre-animation hidden state ourselves,
     right before observing — so a no-JS or reduced-motion visit never has
     anything to "reveal" at all. */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (!prefersReducedMotion && "IntersectionObserver" in window && revealEls.length) {
    revealEls.forEach(function (el) { el.classList.add("reveal-armed"); });
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var el = entry.target;
            var siblingsInSection = el.closest("section")
              ? el.closest("section").querySelectorAll("[data-reveal]")
              : [el];
            var index = Array.prototype.indexOf.call(siblingsInSection, el);
            var delay = Math.max(0, index) * 60;
            el.style.transitionDelay = delay + "ms";
            el.classList.add("is-visible");
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { observer.observe(el); });
  }

  /* ---- the lease device: one countdown drives the hero ring, the hero text,
     the matching access-log row, and (once built) its mobile card equivalent.
     Nothing here is a real credential or a network call — it is a demonstrative,
     client-side-only clock so the specimen's ring, timer, and status agree with
     each other instead of running on three independent, contradicting clocks. */
  var LEASE_SECONDS = 90;
  var EXPIRING_AT = 15;
  var HOLD_AT_EXPIRED_MS = 3000;
  var HERO_R = 60;
  var BADGE_R = 8;
  var HERO_CIRCUMFERENCE = 2 * Math.PI * HERO_R;
  var BADGE_CIRCUMFERENCE = 2 * Math.PI * BADGE_R;

  function formatCountdown(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }

  function statusFor(seconds) {
    if (seconds <= 0) return "expired";
    if (seconds <= EXPIRING_AT) return "expiring";
    return "active";
  }

  function statusLabel(status) {
    if (status === "expired") return "Expired";
    if (status === "expiring") return "Expiring soon";
    return "Active";
  }

  function setChip(el, status) {
    if (!el) return;
    el.classList.remove("status-chip--active", "status-chip--expiring", "status-chip--expired");
    el.classList.add("status-chip--" + status);
    el.textContent = statusLabel(status);
  }

  var leaseRemaining = 47;
  var leaseHolding = false;

  function paintLease() {
    var fractionRemaining = leaseRemaining / LEASE_SECONDS;
    var status = statusFor(leaseRemaining);
    var label = formatCountdown(leaseRemaining);

    var heroRing = document.getElementById("hero-ring-fill");
    if (heroRing) heroRing.style.strokeDashoffset = String(HERO_CIRCUMFERENCE * (1 - fractionRemaining));

    var heroCountdown = document.getElementById("lease-countdown");
    if (heroCountdown) heroCountdown.textContent = label;

    setChip(document.getElementById("hero-status-chip"), status);

    ["table-live", "card-live"].forEach(function (prefix) {
      var ring = document.getElementById(prefix + "-ring");
      if (ring) ring.style.strokeDashoffset = String(BADGE_CIRCUMFERENCE * (1 - fractionRemaining));
      var text = document.getElementById(prefix + "-remaining-text");
      if (text) text.textContent = label;
      setChip(document.getElementById(prefix + "-status-chip"), status);
    });
  }

  function tickLease() {
    if (leaseHolding) return;
    if (leaseRemaining > 0) leaseRemaining -= 1;
    if (leaseRemaining <= 0) {
      leaseRemaining = 0;
      paintLease();
      leaseHolding = true;
      setTimeout(function () {
        leaseRemaining = LEASE_SECONDS;
        leaseHolding = false;
        paintLease();
      }, HOLD_AT_EXPIRED_MS);
      return;
    }
    paintLease();
  }

  paintLease();
  var leaseInterval = null;
  if (!prefersReducedMotion) {
    leaseInterval = setInterval(tickLease, 1000);
  }
  if (reducedMotionQuery && reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener("change", function (event) {
      prefersReducedMotion = event.matches;
      if (prefersReducedMotion && leaseInterval) {
        clearInterval(leaseInterval);
        leaseInterval = null;
      } else if (!prefersReducedMotion && !leaseInterval) {
        leaseInterval = setInterval(tickLease, 1000);
      }
    });
  }
  window.addEventListener("pagehide", function () {
    if (leaseInterval) clearInterval(leaseInterval);
  });

  /* ---- mobile access-log cards, generated from the table's own markup so
     there is exactly one source of truth for the data. If this fails for any
     reason, the table itself remains visible and horizontally scrollable —
     .cards-ready is only added on success, and CSS only swaps views then. */
  (function buildLogCards() {
    var table = document.querySelector(".log-table");
    var panel = document.querySelector(".log-panel");
    var cardsContainer = document.querySelector(".log-cards");
    if (!table || !panel || !cardsContainer) return;
    var rows = table.querySelectorAll("tbody tr");
    if (!rows.length) return;

    var COLUMN_LABELS = ["Secret", "Requested by", "Scope", "Remaining", "Status"];

    rows.forEach(function (row) {
      var cells = row.querySelectorAll("td");
      if (cells.length < COLUMN_LABELS.length) return;
      var isLive = row.dataset.live === "true";
      var card = document.createElement("dl");
      card.className = "log-card";

      COLUMN_LABELS.forEach(function (label, i) {
        var sourceCell = cells[i];
        var rowEl = document.createElement("div");
        rowEl.className = "log-card-row";
        var dt = document.createElement("dt");
        dt.className = "log-card-label";
        dt.textContent = label;
        var dd = document.createElement("dd");
        dd.className = "log-card-value";

        if (label === "Remaining") {
          var remainingSource = sourceCell.querySelector(".log-remaining");
          var wrap = document.createElement("span");
          wrap.className = "log-remaining";
          var srcSvg = remainingSource ? remainingSource.querySelector("svg.ring") : null;
          if (srcSvg) {
            var badgeWrap = document.createElement("span");
            badgeWrap.className = "ring-badge-wrap";
            var newSvg = srcSvg.cloneNode(true);
            var newFill = newSvg.querySelector(".ring-fill");
            if (newFill) {
              if (isLive) newFill.id = "card-live-ring";
              else newFill.removeAttribute("id");
            }
            badgeWrap.appendChild(newSvg);
            wrap.appendChild(badgeWrap);
          }
          var textSpan = document.createElement("span");
          if (isLive) textSpan.id = "card-live-remaining-text";
          textSpan.textContent = remainingSource ? remainingSource.textContent.trim() : sourceCell.textContent.trim();
          wrap.appendChild(textSpan);
          dd.appendChild(wrap);
        } else if (label === "Status") {
          var chipSource = sourceCell.querySelector(".status-chip");
          var chip = document.createElement("span");
          chip.className = chipSource ? chipSource.className : "status-chip";
          if (isLive) chip.id = "card-live-status-chip";
          chip.textContent = chipSource ? chipSource.textContent : sourceCell.textContent.trim();
          dd.appendChild(chip);
        } else {
          dd.textContent = sourceCell.textContent.trim();
        }

        rowEl.appendChild(dt);
        rowEl.appendChild(dd);
        card.appendChild(rowEl);
      });

      cardsContainer.appendChild(card);
    });

    panel.classList.add("cards-ready");
    paintLease(); // sync the freshly-built live card to the current tick immediately
  })();

  /* ---- signup dialog: the primary "Create a vault" action opens a real,
     minimal lead-capture dialog (email only — no password, no account system,
     no network call) rather than scrolling between two anchors that point at
     each other. Purely client-side state; nothing is transmitted anywhere. */
  var dialog = document.getElementById("signup-dialog");
  if (dialog && typeof dialog.showModal === "function") {
    var form = document.getElementById("signup-form");
    var success = document.getElementById("signup-success");
    var emailInput = document.getElementById("signup-email");
    var emailError = document.getElementById("signup-email-error");
    var successEmail = document.getElementById("signup-success-email");
    var openers = document.querySelectorAll("[data-open-signup]");
    var closers = dialog.querySelectorAll("[data-dialog-close]");

    function resetDialog() {
      form.hidden = false;
      success.hidden = true;
      emailError.hidden = true;
      emailInput.setCustomValidity("");
      form.reset();
    }

    openers.forEach(function (btn) {
      btn.addEventListener("click", function () {
        resetDialog();
        dialog.showModal();
        emailInput.focus();
      });
    });

    closers.forEach(function (btn) {
      btn.addEventListener("click", function () { dialog.close(); });
    });

    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener("close", resetDialog);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!emailInput.checkValidity()) {
        emailError.hidden = false;
        emailInput.focus();
        return;
      }
      emailError.hidden = true;
      successEmail.textContent = emailInput.value;
      form.hidden = true;
      success.hidden = false;
      success.querySelector("h2").setAttribute("tabindex", "-1");
      success.querySelector("h2").focus();
    });
  }
})();
