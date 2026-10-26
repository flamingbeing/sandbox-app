// Supervised emulator-only boundary reruns. Source soak/env.sh first; all logs stay in TEMP.
// Fresh emulator + server per seed; process groups are explicitly stopped, even on interruption.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const temp = process.env.TEMP;
if (!temp || !path.resolve(temp).startsWith(path.resolve(root, '..') + path.sep)) throw new Error('TEMP must be inside the job folder');
const children = new Set();
const summary = [];
let stopping = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function start(command, args, name, env) {
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  const fd = fs.openSync(path.join(temp, `${name}.log`), 'w');
  let bytes = 0;
  const write = chunk => { if (bytes < 1024 * 1024) { fs.writeSync(fd, chunk); bytes += chunk.length; } };
  child.stdout.on('data', write); child.stderr.on('data', write);
  child.finished = new Promise(resolve => child.once('close', code => { fs.closeSync(fd); resolve(code); }));
  return child;
}
async function stop(child) {
  if (!children.has(child)) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  await Promise.race([child.finished, sleep(1500)]);
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  await child.finished;
  children.delete(child);
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await Promise.all([...children].map(stop));
  fs.writeFileSync(path.join(temp, 'round3-focused-summary.json'), JSON.stringify(summary, null, 2));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await shutdown(); process.exit(130); });
const deadline = setTimeout(async () => { console.log('Focused runner time limit reached'); await shutdown(); process.exit(124); }, Number(process.env.SOAK_LIMIT_MINUTES || 35) * 60000);
async function ready(url) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).status < 500) return; } catch {}
    await sleep(500);
  }
  throw new Error(`Local service did not become ready: ${url}`);
}
try {
  for (const seed of (process.env.SOAK_SEEDS || '1,4,6,7,8,10,2').split(',').map(Number)) {
    const name = `round3-boundary-${seed}`;
    const env = { ...process.env, SOAK_OUTPUT: name, SOAK_SEEDS: String(seed), SOAK_FOCUS: '1',
      SOAK_TIME_SCALE: process.env.SOAK_TIME_SCALE || '0.01', SOAK_TRACE: '1', SOAK_GUARD_QUICK_ADD: '1',
      SOAK_STATUS: 'observe', SOAK_CLEANUP: '1', SOAK_REUSE_SERVER: '1',
      SOAK_PORT: '8100', SOAK_FIRESTORE_HOST: '127.0.0.1:8101',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8101', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:8102',
      SYNC_DIR: path.join(root, 'node_modules/app-sync'),
    };
    delete env.PW_NO_EMULATOR;
    delete env.SOAK_REPEAT_OFFSET;
    const emulators = start('node', ['soak/emulators.mjs'], `${name}-emulators`, env);
    let server, tests;
    try {
      await ready('http://127.0.0.1:8101/'); await ready('http://127.0.0.1:8102/');
      server = start('node', ['soak/serve.mjs', '8100'], `${name}-server`, env);
      await ready('http://127.0.0.1:8100/app/');
      tests = start('node', ['node_modules/@playwright/test/cli.js', 'test', '-c', 'soak/playwright.config.mjs',
        'soak/chaos.spec.mjs', '--project=chromium', `--repeat-each=${Number(process.env.SOAK_REPEATS || 10)}`,
        `--workers=${Number(process.env.SOAK_WORKERS || 1)}`], name, env);
      const code = await tests.finished;
      let stats;
      try { stats = JSON.parse(fs.readFileSync(path.join(temp, `${name}.json`), 'utf8')).stats; } catch {}
      summary.push({ seed, code, scale: env.SOAK_TIME_SCALE, stats });
      console.log(JSON.stringify(summary.at(-1)));
    } finally {
      if (tests) await stop(tests);
      if (server) await stop(server);
      await stop(emulators);
      fs.writeFileSync(path.join(temp, 'round3-focused-summary.json'), JSON.stringify(summary, null, 2));
    }
  }
} finally { clearTimeout(deadline); await shutdown(); }
