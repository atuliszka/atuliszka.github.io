/* Shared, optional enhancements. Normal links work without JavaScript or analytics. */
(() => {
  function track(name, details) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', name, details);
    } catch (_) { /* Analytics must never interrupt navigation or playback. */ }
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-track]');
    if (!link) return;
    const details = { link_url: link.href };
    if (link.dataset.game) details.game_name = link.dataset.game;
    if (link.dataset.platform) details.platform = link.dataset.platform;
    if (link.dataset.placement) details.placement = link.dataset.placement;
    track(link.dataset.track, details);
  });

  document.querySelectorAll('.trailer-facade').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // File previews cannot supply the HTTP referrer required by YouTube embeds.
      // Keep the ordinary YouTube link usable in that environment.
      if (window.location.protocol === 'file:') return;
      event.preventDefault();
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(link.dataset.videoId)}?autoplay=1&rel=0`;
      iframe.title = `${link.dataset.game} trailer`;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      link.replaceWith(iframe);
      iframe.focus();
      track('trailer_play', {
        game_name: link.dataset.game,
        video_id: link.dataset.videoId,
        placement: link.dataset.placement,
      });
    });
  });
})();
