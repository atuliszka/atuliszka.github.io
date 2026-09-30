(() => {
const DAY = 86400000;
const counters = [
  ['players_in_the_journey', 'Players in the journey'],
  ['fields_harvested_manually', 'Fields harvested by hand'],
  ['swords_forged_by_hand', 'Swords forged'],
  ['kingdom_contracts_fulfilled', 'Kingdom contracts fulfilled'],
  ['land_events_completed', 'Land events completed'],
  ['eastern_town_siege_days_passed', 'Eastern Town siege days survived'],
  ['great_tunnels_built', 'Great Tunnels built'],
  ['settlements_started', 'Settlements commissioned']
];
const activityKeys = new Set(counters.slice(1, 4).map(([key]) => key));
const isTotal = value => Number.isSafeInteger(value) && value >= 0;
function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}
function counterValue(data, key, now, reducedMotion = false) {
  const total = data.current?.[key];
  const actual = { value: isTotal(total) ? total : null, estimated: false, growing: false };
  const previous = data.previous?.[key];
  const presentation = data.presentation;
  if (reducedMotion || !activityKeys.has(key) || !isTotal(total) || !isTotal(previous) ||
      !Array.isArray(presentation?.estimated_counters) || !presentation.estimated_counters.includes(key) ||
      typeof presentation.estimate_label !== 'string' || !presentation.estimate_label.trim()) return actual;
  const gap = (calendarDay(data.current?.data_through) - calendarDay(data.previous?.data_through)) / DAY;
  const published = calendarDay(data.current?.data_through);
  const cap = presentation.max_projection_days;
  if (!(gap > 0) || !Number.isFinite(published) || !Number.isFinite(now) ||
      typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0 || total < previous) return actual;
  const elapsed = Math.max(0, (now - published) / DAY);
  const value = Math.floor(total + (total - previous) / gap * Math.min(elapsed, cap));
  if (!isTotal(value)) return actual;
  return { value, estimated: true, growing: total > previous && elapsed < cap };
}
function rankRows(report) {
  const counts = report?.counts;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return [];
  return Object.entries(counts)
    .filter(([rank]) => !/^Unknown$/i.test(rank.trim()))
    .map(([rank, players]) => ({ rank, players }));
}
function rankPercentages(rows) {
  const known = rows.filter(row => !/^(Unknown|Duke|King)$/i.test(row.rank.trim()));
  const result = new Map();
  if (!known.length || known.some(row => !isTotal(row.players))) return result;
  const total = known.reduce((sum, row) => sum + row.players, 0);
  if (!isTotal(total) || total === 0) return result;
  // Allocate rounded tenths by largest remainder so displayed shares sum to 100%.
  const shares = known.map(row => {
    const exact = row.players / total * 1000;
    return { row, tenths: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const remaining = 1000 - shares.reduce((sum, share) => sum + share.tenths, 0);
  shares.sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < remaining; index++) shares[index].tenths++;
  shares.forEach(share => result.set(share.row, share.tenths / 10));
  return result;
}
function autoScrollRanks(ranks, motion) {
  let frame = 0, lastTime = null, position = 0, inView = false, hovered = false, manual = false;
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = null;
  };
  const start = () => {
    if (frame || manual || hovered || !inView || document.hidden || motion.matches ||
        ranks.scrollLeft >= ranks.scrollWidth - ranks.clientWidth - 1) return;
    frame = requestAnimationFrame(step);
  };
  function step(time) {
    frame = 0;
    if (lastTime === null) position = ranks.scrollLeft;
    else {
      // Traverse the real scroll area, without cloning ranks or wrapping at King.
      const distance = Math.min(100, time - lastTime) * .024;
      // Retain fractional pixels even when the browser rounds scrollLeft writes.
      position = Math.min(ranks.scrollWidth - ranks.clientWidth, position + distance);
      ranks.scrollLeft = position;
    }
    lastTime = time;
    start();
  }
  const takeControl = () => { manual = true; stop(); };
  for (const event of ['pointerdown', 'keydown', 'focusin']) {
    ranks.addEventListener(event, takeControl, { passive: true });
  }
  ranks.addEventListener('wheel', event => {
    if (event.deltaX || event.shiftKey) takeControl();
  }, { passive: true });
  ranks.addEventListener('pointerenter', () => { hovered = true; stop(); });
  ranks.addEventListener('pointerleave', () => { hovered = false; start(); });
  document.addEventListener('visibilitychange', () => { stop(); start(); });
  motion.addEventListener('change', () => { stop(); start(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      stop();
      start();
    }, { threshold: .5 }).observe(ranks);
  }
  return start;
}

if (typeof document !== 'undefined') {
  const section = document.querySelector('#community');
  if (section) init(section);
}

function init(section) {
  const format = new Intl.NumberFormat(document.documentElement.lang || 'en');
  const status = section.querySelector('[data-stats-status]');
  const grid = section.querySelector('[data-stats-grid]');
  const ranks = section.querySelector('[data-stats-ranks]');
  const retry = section.querySelector('[data-stats-retry]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const startRankScroll = ranks ? autoScrollRanks(ranks, motion) : () => {};
  if (ranks && 'ResizeObserver' in window) new ResizeObserver(startRankScroll).observe(ranks);
  const compact = section.dataset.compact === 'true';
  let data, timer, visible = false;
  const cards = (compact ? counters.slice(0, 3) : counters).map(([key, label]) => {
    const card = document.createElement('div');
    card.className = 'community-card';
    const title = document.createElement('dt');
    title.textContent = label;
    const value = document.createElement('dd');
    value.textContent = 'Unavailable';
    card.append(title, value);
    grid.append(card);
    return { key, card, value, seen: false, visible: false, frame: 0 };
  });
  function paint(item, animate = false) {
    cancelAnimationFrame(item.frame);
    item.frame = 0;
    if (!data) return;
    const result = counterValue(data, item.key, Date.now(), motion.matches);
    const finalText = result.value === null ? 'Unavailable' : format.format(result.value);
    if (!animate && item.lastText === finalText) return;
    item.lastText = finalText;
    item.value.setAttribute('aria-label', finalText);
    // Keep the final accessible value stable while the visual digits count up.
    const digits = document.createElement('span');
    digits.setAttribute('aria-hidden', 'true');
    item.value.replaceChildren(digits);
    if (!animate || motion.matches || result.value === null) {
      digits.textContent = finalText;
      return;
    }
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / 750);
      digits.textContent = format.format(Math.floor(result.value * (1 - (1 - progress) ** 3)));
      if (progress < 1) item.frame = requestAnimationFrame(tick);
      else item.frame = 0;
    }
    item.frame = requestAnimationFrame(tick);
  }
  function refresh() {
    clearTimeout(timer);
    if (!data || !visible || document.hidden) return;
    cards.forEach(item => {
      if (!item.visible || item.frame) return;
      paint(item, !item.seen);
      item.seen = true;
    });
    if (!motion.matches && cards.some(item => item.visible && counterValue(data, item.key, Date.now()).growing)) {
      timer = setTimeout(refresh, 100);
    }
  }
  function visibilityChanged() {
    clearTimeout(timer);
    cards.forEach(item => {
      cancelAnimationFrame(item.frame);
      item.frame = 0;
      item.lastText = null;
      if (data) paint(item);
    });
    refresh();
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { cards.find(item => item.card === entry.target).visible = entry.isIntersecting; });
      visible = cards.some(item => item.visible);
      visibilityChanged();
    });
    cards.forEach(item => observer.observe(item.card));
  } else {
    visible = true;
    cards.forEach(item => { item.visible = true; });
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  motion.addEventListener('change', visibilityChanged);

  async function load() {
    clearTimeout(timer);
    data = null;
    cards.forEach(item => {
      cancelAnimationFrame(item.frame);
      item.seen = false;
      item.frame = 0;
      item.lastText = null;
      item.value.textContent = 'Unavailable';
      item.value.removeAttribute('aria-label');
    });
    ranks?.replaceChildren();
    retry.hidden = true;
    status.hidden = false;
    status.textContent = 'Loading the community ledger…';
    section.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      // Revalidate the static file through ordinary HTTP cache headers on every visit.
      const response = await fetch(section.dataset.source, { credentials: 'omit', cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw new Error('Statistics request failed');
      const snapshot = await response.json();
      if (snapshot && snapshot.current === null) {
        status.textContent = 'The community ledger is awaiting its first report. Check back after the next weekly update.';
        return;
      }
      if (!snapshot?.current || typeof snapshot.current !== 'object' || Array.isArray(snapshot.current)) throw new Error('Invalid report');
      data = snapshot;
      status.textContent = '';
      status.hidden = true;
      if (ranks) {
      ranks.replaceChildren();
      const rows = rankRows(data.players_by_rank);
      const percentages = rankPercentages(rows);
      const rankObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.className = 'community-rank is-visible';
          rankObserver.unobserve(entry.target);
        });
      }, { threshold: .3 }) : null;
      for (const row of rows) {
        const entry = document.createElement('div');
        entry.className = 'community-rank';
        const label = document.createElement('dt');
        label.textContent = row.rank;
        const details = document.createElement('dd');
        const count = document.createElement('span');
        count.className = 'community-rank-count';
        const deferred = /^(Duke|King)$/i.test(row.rank.trim());
        if (deferred) count.className += ' community-rank-future';
        count.textContent = deferred
          ? 'Not yet available' : isTotal(row.players) ? format.format(row.players) : 'Unavailable';
        details.append(count);
        const percentage = percentages.get(row);
        if (percentage !== undefined) {
          const share = document.createElement('span');
          share.className = 'community-rank-share';
          const rounded = new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(percentage);
          share.textContent = `${rounded}% of players`;
          const track = document.createElement('span');
          track.className = 'community-rank-track';
          track.setAttribute('aria-hidden', 'true');
          const fill = document.createElement('span');
          fill.className = 'community-rank-fill';
          fill.style.width = `${percentage}%`;
          track.append(fill);
          details.append(share, track);
        }
        entry.append(label, details);
        ranks.append(entry);
        if (rankObserver) rankObserver.observe(entry);
        else entry.className = 'community-rank is-visible';
      }
      section.querySelector('[data-ranks-empty]').hidden = rows.length > 0;
      startRankScroll();
      }
      cards.forEach(item => paint(item));
      refresh();
    } catch {
      status.textContent = 'The community ledger could not be loaded. Please try again.';
      status.hidden = false;
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      section.setAttribute('aria-busy', 'false');
    }
  }
  retry.addEventListener('click', () => load());
  load();
}

if (typeof module !== "undefined") module.exports = { counters, isTotal, calendarDay, counterValue, rankRows, rankPercentages, autoScrollRanks };
})();
