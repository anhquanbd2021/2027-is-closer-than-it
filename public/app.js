import { LAB_DEFAULTS, barAt, simulateLab, projectedReadyWeek } from '/lab.mjs';
import { SCENARIOS, scenarioParams } from '/scenarios.mjs';

const $ = sel => document.querySelector(sel);

const ctl = {
  drift: $('#ctl-drift'),
  study: $('#ctl-study'),
  iter: $('#ctl-iter'),
  weeks: $('#ctl-weeks'),
};
const out = {
  drift: $('#out-drift'),
  study: $('#out-study'),
  iter: $('#out-iter'),
  weeks: $('#out-weeks'),
};
const scenarioButtons = $('#scenario-buttons');
const scaleRow = $('#week-scale');
const starterWeeks = $('#weeks-starter');
const waiterWeeks = $('#weeks-waiter');
const goalpost = $('#goalpost');
const stamp = $('#stamp');
const verdictBadge = $('#verdict');
const waiterTag = $('#waiter-tag');
const ledgerScroll = document.querySelector('.ledger-scroll');

function readParams() {
  return {
    weeks: Number(ctl.weeks.value),
    driftPerWeek: Number(ctl.drift.value),
    studyPerWeek: Number(ctl.study.value),
    iterWeeks: Number(ctl.iter.value),
  };
}

function fmt(n, digits = 2) {
  return n.toFixed(digits);
}

// Slider keys only — barStart and learnPerIter are not exposed in the UI.
const SLIDER_KEYS = { driftPerWeek: 'drift', studyPerWeek: 'study', iterWeeks: 'iter', weeks: 'weeks' };

function activeScenarioId(params) {
  for (const s of SCENARIOS) {
    const merged = { ...LAB_DEFAULTS, ...s.params };
    const match = Object.keys(SLIDER_KEYS).every(k => merged[k] === params[k]);
    if (match) return s.id;
  }
  return null;
}

function renderScenarioButtons() {
  scenarioButtons.innerHTML = '';
  for (const s of SCENARIOS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset';
    btn.dataset.scenario = s.id;
    btn.innerHTML = `<strong>${s.label}</strong>`;
    btn.title = s.blurb;
    btn.addEventListener('click', () => {
      const merged = scenarioParams(s.id);
      for (const [key, el] of Object.entries(SLIDER_KEYS)) {
        ctl[el].value = merged[key];
      }
      update(true);
    });
    scenarioButtons.appendChild(btn);
  }
}

// One cell per week column. The waiter cell is a tiny duel: vermilion fill
// (banked study) vs an amber tick (the bar for that week).
function buildLanes(sim, params) {
  const { weeks } = params;
  const labelW = document.querySelector('.lane-label').offsetWidth;
  const avail = ledgerScroll.clientWidth - labelW - 40;
  const rowWidth = Math.max(avail, (weeks + 1) * 11);
  for (const el of [scaleRow, starterWeeks, waiterWeeks]) {
    el.style.width = `${rowWidth}px`;
  }

  scaleRow.innerHTML = '';
  starterWeeks.innerHTML = '';
  waiterWeeks.innerHTML = ''; // also drops goalpost + stamp — re-appended below

  for (let week = 0; week <= weeks; week++) {
    const cell = document.createElement('span');
    cell.className = 'wk wk-scale';
    cell.style.setProperty('--d', `${week * 14}ms`);
    if (week === weeks) {
      cell.textContent = '2027';
      cell.classList.add('deadline');
    } else if (week % 4 === 0) {
      cell.textContent = String(week);
    }
    scaleRow.appendChild(cell);
  }

  const waiterScale = Math.max(
    ...sim.waiter.samples.map(s => Math.max(s.study, s.bar)),
  ) * 1.08;

  sim.starter.samples.forEach((s, i) => {
    const cell = document.createElement('span');
    cell.className = 'wk';
    cell.style.setProperty('--d', `${i * 14}ms`);
    const isShip = i % params.iterWeeks === 0;
    if (isShip) {
      cell.classList.add('ship');
      const n = i / params.iterWeeks + 1;
      cell.title = `week ${i} — iteration ${n} shipped · skill ${fmt(s.skill)} vs bar ${fmt(s.bar)}`;
    } else {
      cell.title = `week ${i} — skill ${fmt(s.skill)} vs bar ${fmt(s.bar)}`;
    }
    if (i === sim.starter.readyWeek) cell.classList.add('ready');
    starterWeeks.appendChild(cell);
  });

  sim.waiter.samples.forEach((s, i) => {
    const cell = document.createElement('span');
    cell.className = 'wk';
    cell.style.setProperty('--d', `${i * 14}ms`);
    const fill = document.createElement('i');
    fill.className = 'fill';
    fill.style.height = `${Math.min(100, (s.study / waiterScale) * 100)}%`;
    const tick = document.createElement('b');
    tick.className = 'tick';
    tick.style.bottom = `${Math.min(100, (s.bar / waiterScale) * 100)}%`;
    cell.append(fill, tick);
    if (sim.waiter.shippedWeek !== null && i >= sim.waiter.shippedWeek
        && (i - sim.waiter.shippedWeek) % params.iterWeeks === 0) {
      cell.classList.add('waiter-ship');
    }
    if (i === sim.waiter.shippedWeek) cell.classList.add('ready');
    cell.title = `week ${i} — study ${fmt(s.study)} vs bar ${fmt(s.bar)}`;
    waiterWeeks.appendChild(cell);
  });

  // Caret + stamp are absolutely positioned children of the week row, so
  // their left/% coordinates track the columns even when the lane scrolls.
  waiterWeeks.append(goalpost, stamp);
}

function paint(sim, params) {
  const { starter, waiter } = sim;

  verdictBadge.className = `badge ${sim.verdict}`;
  if (sim.verdict === 'treadmill') {
    verdictBadge.textContent = 'NEVER SHIPPED';
  } else if (sim.verdict === 'caught-up') {
    verdictBadge.textContent = `CAUGHT UP · WK ${waiter.shippedWeek}`;
  } else {
    verdictBadge.textContent = `SHIPPED LATE · WK ${waiter.shippedWeek}`;
  }

  waiterTag.textContent = waiter.neverShipped
    ? 'never reaches the bar'
    : `ships wk ${waiter.shippedWeek}`;

  // Goalpost caret: lands on the ship week when the waiter makes it; rides
  // off the right edge of the ledger when the runway ends first.
  if (waiter.neverShipped) {
    goalpost.hidden = false;
    goalpost.classList.add('off-frame');
    goalpost.style.left = ''; // off-frame: anchored just past the row's right edge
    const cross = projectedReadyWeek(params);
    goalpost.title = cross === Infinity
      ? 'the bar outruns study forever'
      : `study would catch the bar at week ${Math.ceil(cross)} — past the deadline`;
    stamp.hidden = false;
  } else {
    goalpost.hidden = false;
    goalpost.classList.remove('off-frame');
    goalpost.style.left = `${((waiter.shippedWeek + 0.5) / (params.weeks + 1)) * 100}%`;
    goalpost.title = `study clears the bar at week ${waiter.shippedWeek}`;
    stamp.hidden = true;
  }

  $('#stat-starter').textContent = `${starter.shippedCount} ships`;
  $('#stat-starter-sub').textContent = `v0 at wk 0 · skill ${fmt(starter.finalSkill)} at the deadline`;

  const lastWaiter = waiter.samples[waiter.samples.length - 1];
  if (waiter.neverShipped) {
    $('#stat-waiter').textContent = 'never ships';
    $('#stat-waiter-sub').textContent = `study ${fmt(lastWaiter.study)} < bar ${fmt(lastWaiter.bar)} — the gap never closes`;
  } else {
    $('#stat-waiter').textContent = `ships wk ${waiter.shippedWeek}`;
    $('#stat-waiter-sub').textContent = `${waiter.shippedCount} iterations · skill ${fmt(waiter.finalSkill)} at the deadline`;
  }

  const gap = starter.finalSkill - waiter.finalSkill;
  $('#stat-gap').textContent = `${gap >= 0 ? '+' : '−'}${fmt(Math.abs(gap))}`;
  $('#stat-gap').classList.toggle('neg', gap < 0);
  $('#stat-gap-sub').textContent = gap >= 0
    ? 'skill units the starter leads by'
    : 'skill units the waiter leads by';

  const cross = projectedReadyWeek(params);
  if (cross === Infinity) {
    $('#stat-ready').textContent = 'never';
    $('#stat-ready-sub').textContent = 'drift ≥ study — the bar recedes every week';
  } else if (cross > params.weeks) {
    $('#stat-ready').textContent = `wk ${Math.ceil(cross)}`;
    $('#stat-ready-sub').textContent = 'past the deadline — out of runway';
  } else {
    $('#stat-ready').textContent = `wk ${Math.ceil(cross)}`;
    $('#stat-ready-sub').textContent = 'where banked study catches the bar';
  }
}

function update(deal = false) {
  const params = readParams();
  out.drift.textContent = `${fmt(params.driftPerWeek)}/wk`;
  out.study.textContent = `${fmt(params.studyPerWeek)}/wk`;
  out.iter.textContent = `every ${params.iterWeeks} wk`;
  out.weeks.textContent = `${params.weeks} wk`;

  const sim = simulateLab(params);
  buildLanes(sim, params);
  paint(sim, params);

  const active = activeScenarioId(params);
  for (const btn of scenarioButtons.querySelectorAll('.preset')) {
    btn.classList.toggle('active', btn.dataset.scenario === active);
  }

  if (deal) dealWeeks();
}

// Re-deal animation: hide every cell's internals, then let the per-week
// transition delays reveal them left to right — the weeks being written.
function dealWeeks() {
  ledgerScroll.classList.add('dealing');
  void ledgerScroll.offsetWidth;
  ledgerScroll.classList.remove('dealing');
}

for (const input of Object.values(ctl)) {
  input.addEventListener('input', () => update(false));
}
window.addEventListener('resize', () => update(false));
$('#run-weeks').addEventListener('click', dealWeeks);

renderScenarioButtons();
update(true);
