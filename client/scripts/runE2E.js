import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = 'http://127.0.0.1:5173';
const viteEntry = path.join(clientRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const playwrightCli = path.join(clientRoot, 'node_modules', '@playwright', 'test', 'cli.js');

async function serverIsReady() {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(serverProcess) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error('Vite exited before the E2E test server became ready.');
    if (await serverIsReady()) return;
    await delay(250);
  }
  throw new Error('Timed out waiting for the Vite E2E test server.');
}

async function stopServer(serverProcess) {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill('SIGTERM');
  await Promise.race([once(serverProcess, 'exit'), delay(3000)]);
  if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
}

let ownedServer = null;
let testProcess = null;
let exitCode = 1;

try {
  if (!await serverIsReady()) {
    ownedServer = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1'], {
      cwd: clientRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
    await waitForServer(ownedServer);
  }

  testProcess = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
    cwd: clientRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  const [code, signal] = await once(testProcess, 'exit');
  exitCode = signal ? 1 : code ?? 1;
} catch (error) {
  console.error(error.message);
  exitCode = 1;
} finally {
  await stopServer(ownedServer);
}

process.exitCode = exitCode;
