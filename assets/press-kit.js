/* Copy is optional: the description stays selectable without JavaScript. */
(() => {
  const button = document.querySelector('[data-copy-description]');
  const description = document.getElementById('short-description');
  const status = document.querySelector('[data-copy-status]');
  if (!button || !description || !status || !navigator.clipboard?.writeText) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(description.textContent.trim());
      status.textContent = 'Copied.';
    } catch (_) {
      status.textContent = 'Select the text above to copy it.';
    }
  });
})();
