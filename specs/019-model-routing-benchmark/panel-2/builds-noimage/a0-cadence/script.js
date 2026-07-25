(function () {
  "use strict";

  // Smooth-scroll fallback + close other open FAQ items for a tidier feel.
  var faqItems = document.querySelectorAll(".faq-list details");
  faqItems.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (item.open) {
        faqItems.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      }
    });
  });

  // Header shadow/background intensifies slightly on scroll.
  var header = document.querySelector(".site-header");
  var lastState = false;
  function onScroll() {
    var scrolled = window.scrollY > 8;
    if (scrolled !== lastState && header) {
      header.style.borderBottomColor = scrolled ? "#2a2f36" : "";
      lastState = scrolled;
    }
  }
  document.addEventListener("scroll", onScroll, { passive: true });
})();
