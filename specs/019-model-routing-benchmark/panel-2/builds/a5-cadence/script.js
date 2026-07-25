(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Scroll reveal: progressive enhancement only.
     Content is fully visible by default in CSS; this only adds a
     class that starts elements hidden, then reveals them, so a
     JS failure or reduced-motion preference simply leaves the
     final, visible state in place. ---- */
  if (!reduceMotion && "IntersectionObserver" in window) {
    var targets = document.querySelectorAll(
      ".context__inner, .feature__inner, .gatecard, .install__inner"
    );

    targets.forEach(function (el) {
      el.classList.add("reveal", "reveal--pending");
    });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal--visible");
            entry.target.classList.remove("reveal--pending");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
    );

    targets.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ---- Copy install command ---- */
  var copyBtn = document.getElementById("copy-btn");
  var cmdEl = document.getElementById("install-cmd");

  if (copyBtn && cmdEl) {
    var label = copyBtn.querySelector("span");
    var defaultLabel = copyBtn.getAttribute("data-default-label") || "Copy";
    var copiedLabel = copyBtn.getAttribute("data-copied-label") || "Copied";
    var failedLabel = "Select → ⌘C";
    var resetTimer = null;

    var flash = function (cssClass, text, ariaLabel) {
      copyBtn.classList.remove("is-copied", "is-failed");
      copyBtn.classList.add(cssClass);
      if (label) label.textContent = text;
      if (ariaLabel) copyBtn.setAttribute("aria-label", ariaLabel);
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        copyBtn.classList.remove(cssClass);
        if (label) label.textContent = defaultLabel;
        copyBtn.removeAttribute("aria-label");
      }, 2200);
    };

    var selectCommandText = function () {
      if (window.getSelection && document.createRange) {
        var range = document.createRange();
        range.selectNodeContents(cmdEl);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    };

    copyBtn.addEventListener("click", function () {
      var text = cmdEl.textContent.trim();

      if (!navigator.clipboard) {
        selectCommandText();
        flash("is-failed", failedLabel, "Clipboard unavailable — command selected, copy manually");
        return;
      }

      navigator.clipboard.writeText(text).then(
        function () {
          flash("is-copied", copiedLabel, copiedLabel);
        },
        function () {
          selectCommandText();
          flash("is-failed", failedLabel, "Copy failed — command selected, copy manually");
        }
      );
    });
  }
})();
