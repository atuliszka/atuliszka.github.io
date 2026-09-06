(() => {
  const screenshots = [...document.querySelectorAll('.screenshot-link')];
  let viewer;
  if (screenshots.length && typeof HTMLDialogElement !== 'undefined' && HTMLDialogElement.prototype.showModal) {
    viewer = document.createElement('dialog');
    viewer.className = 'image-viewer';
    viewer.setAttribute('aria-label', `${document.body.dataset.game} screenshots`);
    viewer.innerHTML = '<div class="viewer-toolbar"><p class="viewer-count" aria-live="polite"></p><button type="button" class="viewer-close" autofocus>Close ✕</button></div><img class="viewer-image" alt=""><p class="viewer-caption"></p><div class="viewer-controls"><button type="button" class="viewer-prev" aria-label="Previous screenshot">← Previous</button><button type="button" class="viewer-next" aria-label="Next screenshot">Next →</button></div>';
    document.body.append(viewer);
    let index = 0;
    let opener;
    const show = (next) => {
      index = (next + screenshots.length) % screenshots.length;
      const source = screenshots[index].querySelector('img');
      const image = viewer.querySelector('.viewer-image');
      image.src = screenshots[index].href;
      image.alt = source.alt;
      viewer.querySelector('.viewer-caption').textContent = source.alt;
      viewer.querySelector('.viewer-count').textContent = `${index + 1} / ${screenshots.length}`;
    };
    screenshots.forEach((link, position) => {
      link.setAttribute('aria-label', `Enlarge: ${link.querySelector('img').alt}`);
      link.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        opener = link;
        show(position);
        viewer.showModal();
        document.body.classList.add('viewer-open');
        updateBar();
      });
    });
    viewer.querySelector('.viewer-close').addEventListener('click', () => viewer.close());
    viewer.querySelector('.viewer-prev').addEventListener('click', () => show(index - 1));
    viewer.querySelector('.viewer-next').addEventListener('click', () => show(index + 1));
    viewer.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        show(index + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });
    viewer.addEventListener('close', () => {
      document.body.classList.remove('viewer-open');
      opener?.focus({ preventScroll: true });
      updateBar();
    });
  }

  const heroActions = document.querySelector('.game-hero .hero-actions');
  const finalActions = document.querySelector('.final-cta .hero-actions');
  const mobile = window.matchMedia('(max-width: 760px)');
  let bar;
  let barHeight = 84;
  let framePending = false;
  function updateBar() {
    if (!bar) return;
    const hero = heroActions.getBoundingClientRect();
    const final = finalActions.getBoundingClientRect();
    // Keep the bar until the final buttons are above its footprint and usable.
    // Retain the measured height when hidden to avoid toggling near the boundary.
    barHeight = bar.offsetHeight || barHeight;
    const finalVisible = final.top < window.innerHeight - barHeight && final.bottom > 0;
    bar.hidden = !mobile.matches || hero.bottom > 0 || finalVisible || Boolean(viewer?.open);
  }
  if (heroActions && finalActions) {
    const links = heroActions.querySelectorAll('[data-track="store_click"]');
    if (links.length) {
      bar = document.createElement('nav');
      bar.className = 'download-bar';
      bar.setAttribute('aria-label', `Download ${document.body.dataset.game}`);
      bar.hidden = true;
      links.forEach((source) => {
        const link = source.cloneNode(true);
        link.dataset.placement = 'sticky';
        link.textContent = source.dataset.platform;
        link.setAttribute('aria-label', `Get ${document.body.dataset.game} on ${source.dataset.platform}`);
        bar.append(link);
      });
      document.body.append(bar);
      document.body.classList.add('has-download-bar');
      const scheduleUpdate = () => {
        if (framePending) return;
        framePending = true;
        requestAnimationFrame(() => { framePending = false; updateBar(); });
      };
      window.addEventListener('scroll', scheduleUpdate, { passive: true });
      window.addEventListener('resize', scheduleUpdate);
      mobile.addEventListener('change', scheduleUpdate);
      updateBar();
    }
  }
})();
