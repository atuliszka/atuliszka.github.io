import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import stats from '../assets/community-stats.js';
import { runInNewContext } from 'node:vm';
const { calendarDay, counterValue, rankRows, rankPercentages } = stats;

const key = 'fields_harvested_manually';
const published = Date.parse('2026-03-30T12:00:00Z');
const report = () => ({
  current: { data_through: '2026-03-30', [key]: 170 },
  previous: { data_through: '2026-03-23', [key]: 100 },
  updated_at: '2026-03-30T14:00:00+02:00',
  presentation: { estimated_counters: [key], max_projection_days: 1, estimate_label: 'Estimate' }
});
test('calendar gap crosses daylight saving without shifting days', () => {
  assert.equal((calendarDay('2026-03-30') - calendarDay('2026-03-23')) / 86400000, 7);
  for (const date of ['2026-02-30', 'invalid', null, '2026-3-1']) assert.ok(Number.isNaN(calendarDay(date)));
});
test('timezone-aware publication anchors growth and one-day cap freezes it', () => {
  const data = report();
  assert.equal(counterValue(data, key, published - 86400000).value, 170);
  assert.equal(counterValue(data, key, published).value, 170);
  assert.equal(counterValue(data, key, published + 43200000).value, 175);
  assert.deepEqual(counterValue(data, key, published + 86400000), { value: 180, estimated: true, growing: false });
  assert.equal(counterValue(data, key, published + 86400000 * 100).value, 180);
});
test('invalid or missing projection inputs use actual totals', () => {
  const mutations = [
    d => { d.previous = null; }, d => { d.previous[key] = null; },
    d => { d.previous[key] = 200; }, d => { d.previous.data_through = d.current.data_through; },
    d => { d.previous.data_through = '2026-04-01'; }, d => { d.current.data_through = '2026-02-30'; },
    d => { d.updated_at = '2026-03-30T12:00:00'; }, d => { d.updated_at = '2026-02-30T12:00:00Z'; },
    d => { d.presentation.max_projection_days = null; }, d => { d.presentation.max_projection_days = -1; },
    d => { d.presentation.estimated_counters = []; }, d => { d.presentation.estimate_label = ''; }
  ];
  for (const mutate of mutations) {
    const data = report(); mutate(data);
    assert.deepEqual(counterValue(data, key, published + 86400000), { value: 170, estimated: false, growing: false });
  }
});
test('reduced motion, players and milestones always use reported values', () => {
  const data = report();
  assert.equal(counterValue(data, key, published + 86400000, true).value, 170);
  for (const actualKey of ['players_in_the_journey', 'great_tunnels_built', 'settlements_started', 'land_events_completed', 'eastern_town_siege_days_passed']) {
    data.current[actualKey] = 10; data.previous[actualKey] = 0;
    data.presentation.estimated_counters.push(actualKey);
    assert.equal(counterValue(data, actualKey, published + 86400000).value, 10);
  }
});
test('zero is valid, null unavailable, and corrected snapshots can decrease', () => {
  const data = report();
  data.current[key] = 0;
  assert.equal(counterValue(data, key, published).value, 0);
  data.current[key] = null;
  assert.equal(counterValue(data, key, published).value, null);
  data.current[key] = 150;
  assert.equal(counterValue(data, key, published).value, 150);
});
test('rank order hides Unknown and retains Duke, King, zero and unavailable counts', () => {
  const rows = [
    { rank: 'Unknown', rank_index: -1, players: 0 }, { rank: 'King', rank_index: 13, players: 0 },
    { rank: 'Duke', rank_index: 12, players: null }, { rank: 'Baron', rank_index: 11, players: 0 },
    { rank: 'Serf', rank_index: 0, players: 3 }
  ];
  assert.deepEqual(rankRows(rows).map(row => row.rank), ['Serf', 'Baron', 'Duke', 'King']);
  assert.equal(rankRows(rows)[2].players, null);
  assert.equal(rankRows(rows)[3].players, 0);
  assert.equal(rows[0].rank, 'Unknown');
});
test('visible rank shares sum to 100% without inventing counts or including Unknown', () => {
  const rows = ['Serf', 'Peasant', 'Farmer', 'Baron', 'Unknown', 'Duke', 'King'].map((rank, rank_index) => ({ rank, rank_index, players: rank_index < 3 ? 1 : rank === 'Unknown' ? 99 : 0 }));
  const before = JSON.stringify(rows);
  const shares = rankPercentages(rows);
  assert.deepEqual([...shares.values()], [33.4, 33.3, 33.3, 0]);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(shares.has(rows[4]), false);
  assert.equal(shares.has(rows[5]), false);
  assert.equal(rankPercentages([{ rank: 'Serf', players: null }]).size, 0);
  assert.equal(rankPercentages([{ rank: 'Serf', players: 0 }]).size, 0);
});
test('rank auto-scroll respects visibility, hover, reduced motion, manual control and the endpoint', async () => {
  const events = () => ({ listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } });
  const doc = { ...events(), hidden: false, querySelector: () => null };
  let observe, pending, nextId = 0;
  const context = {
    module: { exports: {} }, document: doc, window: { IntersectionObserver: true },
    IntersectionObserver: class { constructor(callback) { observe = callback; } observe() {} },
    requestAnimationFrame(callback) { pending = callback; return ++nextId; },
    cancelAnimationFrame() { pending = null; }
  };
  runInNewContext(await readFile(new URL('../assets/community-stats.js', import.meta.url), 'utf8'), context);
  const ranks = { ...events(), scrollLeft: 0, scrollWidth: 1000, clientWidth: 300 };
  const motion = { ...events(), matches: false };
  const start = context.module.exports.autoScrollRanks(ranks, motion);
  const tick = time => { const callback = pending; pending = null; callback(time); };
  start();
  assert.ok(!pending);
  observe([{ isIntersecting: true }]);
  tick(0); tick(100);
  assert.equal(ranks.scrollLeft, 2.4);
  ranks.listeners.pointerenter();
  assert.equal(pending, null);
  ranks.listeners.pointerleave();
  assert.equal(typeof pending, 'function');
  motion.matches = true; motion.listeners.change();
  assert.equal(pending, null);
  motion.matches = false; motion.listeners.change();
  doc.hidden = true; doc.listeners.visibilitychange();
  assert.equal(pending, null);
  doc.hidden = false; doc.listeners.visibilitychange();
  ranks.scrollLeft = 698;
  tick(200); tick(300);
  assert.equal(ranks.scrollLeft, 700);
  assert.equal(pending, null);
  ranks.scrollLeft = 50;
  start();
  ranks.listeners.wheel({ deltaX: 0, deltaY: 100 });
  assert.equal(typeof pending, 'function', 'vertical page scrolling must not disable animation');
  ranks.listeners.wheel({ deltaX: 100 });
  assert.equal(pending, null);
  ranks.listeners.pointerleave(); start();
  assert.equal(pending, null, 'manual scrolling must retain control');
  let roundedPosition = 0;
  const roundedRanks = { ...events(), scrollWidth: 1000, clientWidth: 300,
    get scrollLeft() { return roundedPosition; },
    set scrollLeft(value) { roundedPosition = Math.round(value); }
  };
  context.module.exports.autoScrollRanks(roundedRanks, motion);
  observe([{ isIntersecting: true }]);
  for (let time = 0; time <= 1000; time += 10) tick(time);
  assert.equal(roundedPosition, 24, 'fractional increments accumulate on high refresh rate screens');
  roundedRanks.listeners.pointerdown();
});
test('supplied public report and both page integrations are valid', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/community-stats.json', import.meta.url), 'utf8'));
  assert.equal(data.status, 'ready');
  assert.equal(data.presentation.max_projection_days, 1);
  const ranks = rankRows(data.players_by_rank);
  assert.equal(ranks.find(row => row.rank === 'Duke').players, 0);
  assert.equal(ranks.find(row => row.rank === 'King').players, 0);
  assert.ok(!ranks.some(row => row.rank === 'Unknown'));
  assert.equal([...rankPercentages(ranks).values()].reduce((sum, share) => sum + Math.round(share * 10), 0), 1000);
  const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const game = await readFile(new URL('../games/peasant-to-king/index.html', import.meta.url), 'utf8');
  for (const html of [home, game]) {
    assert.match(html, /public\/data\/community-stats.json/);
    assert.match(html, /defer src="[^"]*community-stats.js"/);
    assert.doesNotMatch(html, /About these numbers|read the public JSON report/);
  }
  assert.doesNotMatch(home, /data-stats-ranks/);
  assert.match(game, /The road to the crown/);
});

test('loader renders both layouts and handles awaiting, HTTP, JSON, and network failures', async () => {
  class Element {
    children = []; textContent = ''; hidden = false; style = {}; attributes = {}; listeners = {};
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(key, callback) { this.listeners[key] = callback; }
  }
  try {
    for (const scenario of ['ready', 'compact', 'compact_live', 'awaiting_data', 'http', 'json', 'network']) {
      const compact = scenario.startsWith('compact');
      const live = scenario === 'compact_live';
      let now = published + 43200000;
      let scheduled;
      const elements = Object.fromEntries(['status', 'grid', 'ranks', 'retry'].map(key => [`[data-stats-${key}]`, new Element()]));
      elements['[data-ranks-empty]'] = new Element();
      if (compact) elements['[data-stats-ranks]'] = null;
      const section = new Element();
      section.dataset = { source: '/public/data/community-stats.json', compact: String(compact) };
      section.querySelector = selector => elements[selector];
      globalThis.document = {
        documentElement: { lang: 'en' }, hidden: false,
        querySelector: () => section, createElement: () => new Element(), addEventListener() {}
      };
      globalThis.window = {};
      globalThis.matchMedia = () => ({ matches: !live, addEventListener() {} });
      globalThis.cancelAnimationFrame = () => {};
      globalThis.fetch = async (url, options) => {
        assert.equal(url, section.dataset.source);
        assert.equal(options.credentials, 'omit');
        assert.equal(options.cache, 'no-cache');
        if (scenario === 'network') throw new Error('offline');
        return {
          ok: scenario !== 'http',
          json: async () => {
            if (scenario === 'json') throw new SyntaxError('invalid JSON');
            const snapshot = { ...report(), status: scenario === 'awaiting_data' ? scenario : 'ready',
              current: { ...report().current, settlements_started: 0 }, players_by_rank: [
                { rank: 'Unknown', rank_index: -1, players: 0 },
                { rank: 'Duke', rank_index: 12, players: 0 },
                { rank: 'King', rank_index: 13, players: 0 }
              ] };
            if (live) { snapshot.current[key] = 604800; snapshot.previous[key] = 0; }
            return snapshot;
          }
        };
      };
      runInNewContext(await readFile(new URL('../assets/community-stats.js', import.meta.url), 'utf8'), {
        document, window, matchMedia, cancelAnimationFrame, fetch, AbortController, Intl,
        Date: class extends Date { static now() { return now; } },
        performance: { now: () => 0 }, requestAnimationFrame: callback => { callback(750); return 0; },
        setTimeout: live ? (callback, delay) => { if (delay === 100) scheduled = callback; return delay; } : setTimeout,
        clearTimeout: live ? id => { if (id === 100) scheduled = undefined; } : clearTimeout
      });
      await setImmediate();
      assert.equal(section.attributes['aria-busy'], 'false');
      const status = elements['[data-stats-status]'].textContent;
      if (['ready', 'compact', 'compact_live'].includes(scenario)) {
        assert.equal(status, '');
        assert.equal(elements['[data-stats-status]'].hidden, true);
        const cards = elements['[data-stats-grid]'].children;
        assert.equal(cards.length, compact ? 3 : 8);
        assert.equal(cards[0].children[1].attributes['aria-label'], 'Unavailable');
        if (!compact) {
          assert.equal(cards[7].children[1].attributes['aria-label'], '0');
          const ranks = elements['[data-stats-ranks]'].children;
          assert.equal(ranks.length, 2);
          for (const rank of ranks) {
            assert.equal(rank.children[1].children[0].textContent, 'Not yet available');
          }
        }
        assert.equal(cards[1].children[1].attributes['aria-label'], live ? '648,000' : '170');
        if (live) {
          assert.equal(cards[1].children.length, 2);
          const unchangedDigits = cards[1].children[1].children[0];
          now += 100;
          scheduled();
          assert.equal(cards[1].children[1].children[0], unchangedDigits);
          now += 900;
          scheduled();
          assert.equal(cards[1].children[1].attributes['aria-label'], '648,001');
          now = published + 86400000;
          scheduled();
          assert.equal(cards[1].children[1].attributes['aria-label'], '691,200');
          assert.equal(scheduled, undefined);
        }
      } else if (scenario === 'awaiting_data') {
        assert.match(status, /awaiting its first report/);
      } else {
        assert.match(status, /could not be loaded/);
        assert.equal(elements['[data-stats-retry]'].hidden, false);
      }
    }
  } finally {
    for (const key of ['document', 'window', 'matchMedia', 'cancelAnimationFrame', 'fetch']) delete globalThis[key];
  }
});
