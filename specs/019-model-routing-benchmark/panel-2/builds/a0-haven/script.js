(function () {
  "use strict";

  // FAQ accordion
  var items = document.querySelectorAll(".faq-item");
  items.forEach(function (item) {
    var btn = item.querySelector(".faq-q");
    btn.addEventListener("click", function () {
      var isOpen = item.classList.contains("open");
      items.forEach(function (i) { i.classList.remove("open"); });
      if (!isOpen) item.classList.add("open");
    });
  });

  // Mobile nav toggle: reveal the nav links list as a simple stacked menu
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("mobile-open");
      links.style.display = open ? "flex" : "";
      if (open) {
        links.style.position = "absolute";
        links.style.top = "72px";
        links.style.left = "0";
        links.style.right = "0";
        links.style.flexDirection = "column";
        links.style.gap = "0";
        links.style.background = "#fbfaf7";
        links.style.borderBottom = "1px solid #e4e1d8";
        links.style.padding = "8px 20px 16px";
      }
      links.querySelectorAll("a").forEach(function (a) {
        a.style.padding = open ? "12px 0" : "";
        a.style.width = open ? "100%" : "";
      });
    });
  }
})();
