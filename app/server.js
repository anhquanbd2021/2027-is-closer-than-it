import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateLab } from '../public/lab.mjs';
import { SCENARIOS, scenarioById } from '../public/scenarios.mjs';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const STATIC_FILES = new Map([
  ['/', ['text/html; charset=utf-8', 'index.html']],
  ['/guide.html', ['text/html; charset=utf-8', 'guide.html']],
  ['/styles.css', ['text/css; charset=utf-8', 'styles.css']],
  ['/app.js', ['text/javascript; charset=utf-8', 'app.js']],
  ['/lab.mjs', ['text/javascript; charset=utf-8', 'lab.mjs']],
  ['/scenarios.mjs', ['text/javascript; charset=utf-8', 'scenarios.mjs']],
  ['/pb-shell.css', ['text/css; charset=utf-8', 'pb-shell.css']],
  ['/pb-back.css', ['text/css; charset=utf-8', 'pb-back.css']],
].map(([path, [type, file]]) => [path, [type, readFileSync(join(PUBLIC, file))]]));
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

// Optional numeric overrides for /api/simulate — anything else is ignored.
const PARAM_KEYS = ['weeks', 'barStart', 'driftPerWeek', 'studyPerWeek', 'learnPerIter', 'iterWeeks'];

function simulationParams(url) {
  const params = {};
  const scenarioId = url.searchParams.get('scenario');
  if (scenarioId) {
    const scenario = scenarioById(scenarioId);
    if (!scenario) return null;
    Object.assign(params, scenario.params);
  }
  const MIN = { weeks: 1, iterWeeks: 1 };
  for (const key of PARAM_KEYS) {
    const raw = url.searchParams.get(key);
    if (raw === null) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < (MIN[key] ?? 0)) return null;
    params[key] = value;
  }
  return params;
}

function sendJson(res, status, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' })
    .end(JSON.stringify(body));
}

export function createStaticServer() {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end('ok');
      return;
    }
    if (url.pathname === '/version') {
      sendJson(res, 200, {
        name: PACKAGE.name,
        version: PACKAGE.version,
        commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
      });
      return;
    }
    if (url.pathname === '/api/scenarios') {
      sendJson(res, 200, { scenarios: SCENARIOS });
      return;
    }
    if (url.pathname === '/api/simulate') {
      const params = simulationParams(url);
      if (!params) {
        sendJson(res, 400, { error: 'bad params — expected ?scenario=<id> or positive numeric overrides' });
        return;
      }
      sendJson(res, 200, simulateLab(params));
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const asset = STATIC_FILES.get(url.pathname);
      if (asset) {
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          'cache-control': 'public, max-age=300',
          'content-type': asset[0],
        }).end(req.method === 'HEAD' ? undefined : asset[1]);
        return;
      }
    }
    res.writeHead(404, SECURITY_HEADERS).end('not found');
  });
}

export async function startProduction({ port = Number(process.env.PORT) || 3000 } = {}) {
  const server = createStaticServer();
  server.listen(port, '0.0.0.0');
  await once(server, 'listening');
  const close = () => new Promise(resolve => server.close(resolve));
  return { server, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { server, close } = await startProduction();
  console.log(`2027 Is Closer Than It Lab listening on ${server.address().port}`);
  const shutdown = async () => { await close(); process.exit(0); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
