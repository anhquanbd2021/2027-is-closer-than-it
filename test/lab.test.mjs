import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAB_DEFAULTS,
  barAt,
  simulateStarter,
  simulateWaiter,
  simulateLab,
  verdictFor,
  projectedReadyWeek,
} from '../public/lab.mjs';

test('LAB_DEFAULTS is frozen and matches the published contract', () => {
  assert.ok(Object.isFrozen(LAB_DEFAULTS));
  assert.deepEqual(LAB_DEFAULTS, {
    weeks: 64, barStart: 1.0, driftPerWeek: 0.02,
    studyPerWeek: 0.05, learnPerIter: 0.15, iterWeeks: 2,
  });
});

test('barAt is a straight line from barStart at the drift rate', () => {
  assert.equal(barAt(0), 1.0);
  assert.equal(barAt(50), 1.0 + 0.02 * 50);
  assert.equal(barAt(10, { barStart: 2, driftPerWeek: 0.1 }), 3);
});

test('starter ships at week 0 and compounds once per cadence', () => {
  const s = simulateStarter();
  assert.equal(s.shippedWeek, 0);
  assert.equal(s.shippedCount, 33); // weeks 0,2,...,64 on a 64-week runway
  assert.equal(s.finalSkill, 33 * 0.15);
  assert.equal(s.samples.length, 65);
  assert.equal(s.readyWeek, 16); // shipped skill clears the bar mid-runway
});

test('waiter on defaults ships at week 34 — late but on the board', () => {
  const w = simulateWaiter();
  // study(33)=1.65 < bar(33)=1.66; study(34)=1.70 >= bar(34)=1.68
  assert.equal(w.shippedWeek, 34);
  assert.equal(w.neverShipped, false);
  assert.equal(w.shippedCount, 16); // weeks 34,36,...,64
  assert.equal(w.finalSkill, 34 * 0.05 + 16 * 0.15); // study converts, then compounds
  assert.equal(w.readyWeek, 34);
});

test('FAILURE MODE: drift >= study means the waiter never ships', () => {
  for (const params of [
    { driftPerWeek: 0.06 },               // treadmill preset
    { driftPerWeek: 0.05 },               // drift exactly equals study
    { driftPerWeek: 0.02, studyPerWeek: 0.02 },
  ]) {
    const w = simulateWaiter(params);
    assert.equal(w.neverShipped, true, JSON.stringify(params));
    assert.equal(w.shippedWeek, null);
    assert.equal(w.shippedCount, 0);
    assert.equal(w.finalSkill, 0);
    assert.equal(w.readyWeek, null);
    // study still accumulated — it just never converted
    const last = w.samples[w.samples.length - 1];
    assert.ok(last.study < last.bar, 'the gap never closes');
  }
});

test('projectedReadyWeek: finite crossing, past-deadline crossing, never', () => {
  assert.ok(Math.abs(projectedReadyWeek() - 100 / 3) < 1e-9); // defaults: wk ~33.3
  assert.equal(projectedReadyWeek({ driftPerWeek: 0.06 }), Infinity);
  assert.equal(projectedReadyWeek({ driftPerWeek: 0.05 }), Infinity);
  assert.equal(projectedReadyWeek({ barStart: 0 }), 0);
});

test('a finite crossing beyond the runway is still a never-shipped waiter', () => {
  // study would catch the bar at week ~33.3, but the runway ends at 20.
  const w = simulateWaiter({ weeks: 20 });
  assert.equal(w.neverShipped, true);
  assert.equal(simulateLab({ weeks: 20 }).verdict, 'treadmill');
});

test('verdicts: late-start baseline, treadmill failure, caught-up flip', () => {
  assert.equal(simulateLab().verdict, 'late-start');
  assert.equal(simulateLab({ driftPerWeek: 0.06 }).verdict, 'treadmill');
  // 6-week cadence halves the starter's compounding; the waiter catches up.
  assert.equal(simulateLab({ iterWeeks: 6 }).verdict, 'caught-up');

  const caughtUp = simulateLab({ iterWeeks: 6 });
  assert.ok(caughtUp.waiter.finalSkill >= caughtUp.starter.finalSkill);
});

test('verdictFor reads any {starter, waiter} pair', () => {
  const sim = simulateLab();
  assert.equal(verdictFor(sim), sim.verdict);
  assert.equal(verdictFor({
    starter: { finalSkill: 1 },
    waiter: { neverShipped: false, finalSkill: 1 },
  }), 'caught-up');
});

test('simulation is deterministic and returns fresh objects', () => {
  const a = simulateLab();
  const b = simulateLab();
  assert.deepEqual(a, b);
  assert.notEqual(a.starter.samples, b.starter.samples);
  assert.equal(simulateLab().params.weeks, LAB_DEFAULTS.weeks);
});
