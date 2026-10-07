// The Readiness Treadmill — the simulation core of the 2027 Is Closer Than
// It Lab. Two weekly-tick tracks share one runway of `weeks` to the deadline:
//
//   STARTER  ships v0 at week 0 and gains `learnPerIter` skill every
//            `iterWeeks` — readiness becomes an output of shipping.
//   WAITER   accumulates study at `studyPerWeek` and may only ship once
//            study >= barAt(week). Prep converts to skill on the ship week;
//            after that only iterations compound.
//
// The bar is not fixed: barAt(week) = barStart + driftPerWeek * week.
// When driftPerWeek >= studyPerWeek the waiter's study never catches the
// goalpost — `neverShipped: true`, the failure mode this lab exists to show.
//
// Everything here is pure and deterministic — no clocks, no randomness — so
// the browser UI, the CLI, and `node --test` all see identical numbers.

export const LAB_DEFAULTS = Object.freeze({
  weeks: 64,        // runway: roughly the distance from "now" to 2027
  barStart: 1.0,    // what "ready" means at week 0, in skill units
  driftPerWeek: 0.02, // how fast the field moves the bar every week
  studyPerWeek: 0.05, // the waiter's prep rate
  learnPerIter: 0.15, // skill gained per shipped iteration (either track)
  iterWeeks: 2,     // weeks between shipped iterations once shipping
});

export function barAt(week, params = LAB_DEFAULTS) {
  const p = { ...LAB_DEFAULTS, ...params };
  return p.barStart + p.driftPerWeek * week;
}

// Ship events land on a fixed cadence: startWeek, startWeek + iterWeeks, ...
// Returning a count (not a list) keeps callers honest about the math.
function shipsSoFar(week, startWeek, iterWeeks) {
  if (startWeek === null || week < startWeek) return 0;
  return Math.floor((week - startWeek) / iterWeeks) + 1;
}

export function simulateStarter(params = {}) {
  const p = { ...LAB_DEFAULTS, ...params };
  const shippedWeek = 0;
  const shippedCount = shipsSoFar(p.weeks, shippedWeek, p.iterWeeks);
  let readyWeek = null;
  const samples = [];
  for (let week = 0; week <= p.weeks; week++) {
    const skill = p.learnPerIter * shipsSoFar(week, shippedWeek, p.iterWeeks);
    const bar = barAt(week, p);
    // First week the starter's shipped skill clears the moving bar.
    if (readyWeek === null && skill >= bar) readyWeek = week;
    samples.push({ week, skill, bar });
  }
  return {
    kind: 'starter',
    samples,
    shippedWeek,
    shippedCount,
    finalSkill: p.learnPerIter * shippedCount,
    readyWeek,
  };
}

export function simulateWaiter(params = {}) {
  const p = { ...LAB_DEFAULTS, ...params };

  // The ship gate: first week where accumulated study clears the drifting
  // bar. If driftPerWeek >= studyPerWeek the gap only widens and this loop
  // runs the whole runway without a match — the treadmill.
  let shippedWeek = null;
  for (let week = 0; week <= p.weeks; week++) {
    if (p.studyPerWeek * week >= barAt(week, p)) {
      shippedWeek = week;
      break;
    }
  }

  const shippedCount = shippedWeek === null ? 0 : shipsSoFar(p.weeks, shippedWeek, p.iterWeeks);
  const studyAtShip = shippedWeek === null ? 0 : p.studyPerWeek * shippedWeek;

  const samples = [];
  for (let week = 0; week <= p.weeks; week++) {
    const study = p.studyPerWeek * week;
    const bar = barAt(week, p);
    const ships = shipsSoFar(week, shippedWeek, p.iterWeeks);
    // Study is not skill. It converts to skill on the ship week; after that
    // the track compounds exactly like the starter's — one learnPerIter per
    // shipped iteration, and unshipped prep never counts again.
    const skill = ships === 0 ? 0 : studyAtShip + p.learnPerIter * ships;
    samples.push({ week, study, bar, skill });
  }

  return {
    kind: 'waiter',
    samples,
    shippedWeek,
    shippedCount,
    finalSkill: shippedCount === 0 ? 0 : studyAtShip + p.learnPerIter * shippedCount,
    readyWeek: shippedWeek,
    neverShipped: shippedWeek === null,
  };
}

// Where banked study would catch the drifting bar if the runway never ended:
// solve studyPerWeek * w = barStart + driftPerWeek * w. Infinity means the
// bar outruns study forever — the treadmill's mathematical form.
export function projectedReadyWeek(params = {}) {
  const p = { ...LAB_DEFAULTS, ...params };
  if (p.barStart <= 0) return 0;
  if (p.studyPerWeek <= p.driftPerWeek) return Infinity;
  return p.barStart / (p.studyPerWeek - p.driftPerWeek);
}

export function verdictFor(sim) {
  if (sim.waiter.neverShipped) return 'treadmill';
  if (sim.waiter.finalSkill >= sim.starter.finalSkill) return 'caught-up';
  return 'late-start';
}

export function simulateLab(params = {}) {
  const p = { ...LAB_DEFAULTS, ...params };
  const starter = simulateStarter(p);
  const waiter = simulateWaiter(p);
  return {
    weeks: p.weeks,
    params: p,
    starter,
    waiter,
    verdict: verdictFor({ starter, waiter }),
  };
}
