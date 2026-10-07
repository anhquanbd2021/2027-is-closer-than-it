import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../app/server.js';
import { once } from 'node:events';

async function withServer(fn) {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('/health and /version respond; static allowlist serves the lab', async () => {
  await withServer(async base => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');

    const version = await fetch(`${base}/version`);
    assert.equal(version.status, 200);
    assert.equal((await version.json()).name, '2027-is-closer-than-it-demo');

    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    const html = await index.text();
    assert.match(html, /2027 Is Closer Than It Lab/);
    assert.match(html, /<nav aria-label="Primary">/);
    assert.match(html, /<a aria-current="page" href="\/">Lab<\/a>/);

    const guide = await fetch(`${base}/guide.html`);
    assert.equal(guide.status, 200);
    assert.match(await guide.text(), /<a aria-current="page" href="\/guide\.html">Guide<\/a>/);

    for (const path of ['/app.js', '/lab.mjs', '/scenarios.mjs', '/styles.css', '/pb-shell.css', '/pb-back.css']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, path);
    }
  });
});

test('/api/scenarios lists the presets; /api/simulate runs them', async () => {
  await withServer(async base => {
    const scenarios = await fetch(`${base}/api/scenarios`);
    assert.equal(scenarios.status, 200);
    const ids = (await scenarios.json()).scenarios.map(s => s.id);
    assert.ok(ids.includes('readiness-treadmill'));

    const treadmill = await fetch(`${base}/api/simulate?scenario=readiness-treadmill`);
    assert.equal(treadmill.status, 200);
    const tj = await treadmill.json();
    assert.equal(tj.verdict, 'treadmill');
    assert.equal(tj.waiter.neverShipped, true);
    assert.equal(tj.waiter.shippedWeek, null);

    const steady = await fetch(`${base}/api/simulate`);
    const sj = await steady.json();
    assert.equal(sj.waiter.shippedWeek, 34);
    assert.equal(sj.verdict, 'late-start');

    const override = await fetch(`${base}/api/simulate?weeks=20`);
    assert.equal((await override.json()).verdict, 'treadmill');

    assert.equal((await fetch(`${base}/api/simulate?scenario=bogus`)).status, 400);
    assert.equal((await fetch(`${base}/api/simulate?weeks=-5`)).status, 400);
  });
});

test('unknown paths and traversal return 404; HEAD works; security headers set', async () => {
  await withServer(async base => {
    assert.equal((await fetch(`${base}/../package.json`)).status, 404);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal((await fetch(`${base}/app/server.js`)).status, 404);
    const head = await fetch(`${base}/`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');

    const res = await fetch(`${base}/`);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  });
});
