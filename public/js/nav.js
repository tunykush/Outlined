(function () {
  'use strict';

  // ── Theme toggle ──────────────────────────────────────────
  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  // ── Hamburger / mobile overlay ────────────────────────────
  var hamburger     = document.getElementById('hamburgerBtn');
  var mobileOverlay = document.getElementById('mobileMenu');
  var overlayClose  = document.getElementById('overlayClose');

  if (!hamburger || !mobileOverlay) return;

  function closeMenu() {
    mobileOverlay.classList.remove('is-open');
    hamburger.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  }

  function openMenu() {
    mobileOverlay.classList.add('is-open');
    hamburger.classList.add('is-open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
  }

  hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    mobileOverlay.classList.contains('is-open') ? closeMenu() : openMenu();
  });

  if (overlayClose) {
    overlayClose.addEventListener('click', closeMenu);
  }

  // Close when any link inside the overlay is clicked
  mobileOverlay.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mobileOverlay.classList.contains('is-open')) {
      closeMenu();
      hamburger.focus();
    }
  });

  // Close if window resizes above mobile breakpoint
  window.addEventListener('resize', function () {
    if (window.innerWidth > 640 && mobileOverlay.classList.contains('is-open')) {
      closeMenu();
    }
  });

})();
