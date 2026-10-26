// No live project, credentials or machine installation. Generated config/logs stay in TEMP.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
if (spawnSync('java', ['-version'], { stdio: 'ignore' }).status !== 0) {
  throw new Error('Firestore emulator requires Java; Java is unavailable. No tests ran.');
}
const tmp = await mkdtemp(path.join(process.env.TEMP || os.tmpdir(), 'sandbox-soak-'));
await writeFile(path.join(tmp, 'firebase.json'), JSON.stringify({
  firestore: { rules: path.resolve('app/firestore.rules') },
  emulators: { firestore: { port: 8101, websocketPort: 8105 }, auth: { port: 8102 }, hub: { port: 8103 }, logging: { port: 8104 }, ui: { enabled: false }, singleProjectMode: true },
}));
const child = spawn('npx', ['--yes', 'firebase-tools@15.33.0', 'emulators:start', '--config', path.join(tmp, 'firebase.json'), '--only', 'firestore,auth', '--project', 'demo-sandbox-app'], {
  cwd: tmp, stdio: 'inherit', env: { ...process.env, FIREBASE_CLI_DISABLE_USAGE_REPORTING: 'true' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
