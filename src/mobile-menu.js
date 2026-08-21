export function initializeMobileMenu() {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('[data-mobile-menu-toggle]');
  const panel = document.querySelector('[data-mobile-menu-panel]');
  if (!header || !toggle || !panel) return;

  const closeMenu = () => {
    header.classList.remove('mobile-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
  };

  const openMenu = () => {
    header.classList.add('mobile-menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation menu');
  };

  toggle.addEventListener('click', () => {
    if (header.classList.contains('mobile-menu-open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  panel.querySelectorAll('a, button').forEach((item) => {
    item.addEventListener('click', closeMenu);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 620) closeMenu();
  });
}
