# 2027 Is Closer Than It Lab — companion demo

Interactive lab for the article *The Readiness Treadmill: Why Waiting to Feel
Ready for AI Engineering Never Ends*. Two weekly-tick tracks share one runway
to the deadline: the **starter** ships v0 at week 0 and compounds skill every
iteration; the **waiter** studies until prep clears a readiness bar that keeps
drifting with the field.

Zero dependencies — Node 24+ only. The simulation, the scenarios, and the
verdict logic are plain ES modules shared by the browser UI, the CLI, the
HTTP API, and the test suite.

## What it proves

Waiting for "ready" fails mechanically, not morally: when the bar drifts at
`driftPerWeek` and study accumulates at `studyPerWeek`, `drift ≥ study` means
the gap never closes — `simulateWaiter` returns `neverShipped: true` and the
ledger stamps **NEVER SHIPPED**. On defaults the waiter ships at week 34 —
late, seventeen iterations behind, but on the board.

| Preset | What it shows |
|---|---|
| `steady-field` | Defaults — waiter ships wk 34, verdict `late-start` |
| `readiness-treadmill` | Drift 0.06 ≥ study 0.05 — the bar recedes forever |
| `compressed-runway` | 20-week runway — projected ready week lands past the deadline |
| `slow-iteration` | 6-week cadence — waiter ships late and still catches the starter |

## Run it

```text
npm start        # serve the lab on http://localhost:3000
npm test         # simulation + scenario + server (e2e) suites
npm run track    # CLI: weekly table for both tracks + verdict
npm run check    # npm test
```

`node scripts/track.mjs --scenario readiness-treadmill` prints the waiter
studying all 64 weeks and shipping nothing.

`GET /api/simulate?scenario=<id>` runs the same simulation over HTTP;
`GET /api/scenarios` lists the presets.

## Layout

- `public/lab.mjs` — `barAt`, `simulateStarter`, `simulateWaiter`,
  `simulateLab`, `verdictFor`, `projectedReadyWeek`, `LAB_DEFAULTS`
- `public/scenarios.mjs` — `SCENARIOS`, `scenarioById`, `scenarioParams`
- `public/app.js` — sliders, preset buttons, the twin-lane week ledger
- `app/server.js` — `node:http` static host + `/health`, `/version`, `/api/*`
- `scripts/track.mjs` — the CLI ledger
- `test/` — `node --test "test/*.test.mjs"`

## Honest limits

- Skill and "ready" are abstract units — real readiness is messier and partly
  unmeasurable.
- Drift is a constant rate; real fields lurch, plateau, and sometimes slow.
- The waiter stops gaining from study at the ship week — a modeling choice
  that keeps the mechanism legible, not a law.
- Iteration gain is linear; real compounding depends on feedback quality,
  not just cadence.

This is an educational demo, not production infrastructure.

Repo: https://github.com/anhquanbd2021/2027-is-closer-than-it
