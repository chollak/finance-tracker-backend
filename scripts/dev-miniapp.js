#!/usr/bin/env node
/*
 * Local Telegram Mini App launcher / menu-button helper.
 *
 * Common usage:
 *   npm run dev:miniapp -- --chat-id=131184740
 *   npm run miniapp:menu -- status --chat-id=131184740
 *   npm run miniapp:menu -- set --url=https://example.trycloudflare.com --chat-id=131184740
 *
 * The script never prints TG_BOT_API_KEY. It updates ignored local env files only.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const DEFAULT_PORT = 3000;
const DEFAULT_MENU_TEXT = 'Kapelka DEV';

function printHelp() {
  console.log(`Kapelka Telegram Mini App helper\n\nUsage:\n  npm run dev:miniapp -- --chat-id=<telegram_chat_id> [--skip-build]\n  npm run miniapp:menu -- status --chat-id=<telegram_chat_id>\n  npm run miniapp:menu -- set --url=<https_url> --chat-id=<telegram_chat_id>\n\nOptions:\n  --chat-id, --chatId       Telegram chat/user id for the persistent menu button\n  --url                    Public HTTPS Mini App URL for set/status checks\n  --path                   set only: open this page from the menu button (e.g. /dev/voice-check); WEB_APP_URL is not changed\n  --env-file               Env file to update (default: the one the app reads — .env.local if present, else .env)\n  --menu-text              Telegram menu button text (default: Kapelka DEV)\n  --port                   Backend port (default: 3000)\n  --skip-build             Skip npm run build:webapp && npm run build before serve\n  --no-serve               Only create/update tunnel/menu; do not start npm run serve\n  --no-menu                Do not call Telegram setChatMenuButton\n  --help                   Show help\n\nNotes:\n  - For Telegram Mini App on a phone, WEB_APP_URL must be public HTTPS.\n  - Old inline buttons keep their embedded URL; send /start after a tunnel change.\n  - The persistent chat menu button must be updated separately; this helper does it.\n  - A quick tunnel does not survive the machine sleeping: when Cloudflare drops it, the helper opens a new one,\n    updates WEB_APP_URL and the menu button, and restarts the server it started.\n`);
}

function parseArgs(argv) {
  const args = { command: 'run', flags: {}, positional: [] };
  const tokens = [...argv];
  if (tokens[0] && !tokens[0].startsWith('-')) args.command = tokens.shift();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('--')) {
      args.positional.push(token);
      continue;
    }
    const raw = token.slice(2);
    if (raw.includes('=')) {
      const [key, ...rest] = raw.split('=');
      args.flags[key] = rest.join('=');
    } else {
      const next = tokens[i + 1];
      if (next && !next.startsWith('--')) {
        args.flags[raw] = next;
        i += 1;
      } else {
        args.flags[raw] = true;
      }
    }
  }
  return args;
}

// The file the app reads (AppConfig): .env.local when it exists, otherwise .env. Updating another one would leave
// the server on the old WEB_APP_URL.
function envFileFor(flags, baseDir = root) {
  if (flags['env-file']) return path.resolve(baseDir, flags['env-file']);
  const local = path.join(baseDir, '.env.local');
  return fs.existsSync(local) ? local : path.join(baseDir, '.env');
}

// CLOUDFLARED_BIN, then ~/.local/bin (the WSL setup), then PATH (Homebrew on macOS); null when it is nowhere.
function findCloudflared(env = process.env) {
  if (env.CLOUDFLARED_BIN) return env.CLOUDFLARED_BIN;
  const onPath = (env.PATH || '').split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, 'cloudflared'));
  return [path.join(env.HOME || '', '.local/bin/cloudflared'), ...onPath].find(isExecutableFile) || null;
}

function isExecutableFile(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function readEnv(envFile) {
  const env = {};
  if (!fs.existsSync(envFile)) return env;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function writeEnvValue(envFile, key, value) {
  let lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/) : [];
  let found = false;
  lines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) lines.push(`${key}=${value}`);
  fs.writeFileSync(envFile, `${lines.filter((line, index) => !(line === '' && index === lines.length - 1)).join('\n')}\n`);
}

function normalizeBaseUrl(url) {
  if (!url) throw new Error('Missing URL');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error(`Mini App URL must be HTTPS for Telegram: ${url}`);
  parsed.hash = '';
  return parsed.origin + parsed.pathname.replace(/\/$/, '');
}

function urlForChat(baseUrl, chatId, menuPath = '/') {
  const url = new URL(menuPath, normalizeBaseUrl(baseUrl));
  if (chatId) url.searchParams.set('userId', String(chatId));
  return url.toString();
}

function requestJson(url, { method = 'GET', body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const data = body ? new URLSearchParams(body).toString() : null;
    const req = client.request(parsed, {
      method,
      timeout: timeoutMs,
      headers: data ? {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      } : undefined,
    }, (res) => {
      let response = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { response += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(response) });
        } catch (error) {
          reject(new Error(`Non-JSON response from ${parsed.hostname}: HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Request timed out: ${parsed.hostname}`)));
    // No answer at all — no network, no DNS, a timeout — as opposed to an answer that is not JSON
    req.on('error', (error) => reject(Object.assign(new Error(error.message), { unreachable: true })));
    if (data) req.write(data);
    req.end();
  });
}

// `apiBase` is for tests. Messages never carry the URL: it holds the bot token.
async function telegramCall(token, method, body = null, { apiBase = 'https://api.telegram.org' } = {}) {
  if (!token) throw new Error('TG_BOT_API_KEY is missing in env file or process env');
  const response = await requestJson(`${apiBase}/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    body,
  }).catch((error) => {
    throw error.unreachable ? new Error(`Telegram is out of reach — is the network up? (${error.message})`) : error;
  });
  if (!response.json.ok) {
    throw new Error(`Telegram ${method} failed: ${response.json.description || `HTTP ${response.status}`}`);
  }
  return response.json.result;
}

async function getMenu(token, chatId) {
  return telegramCall(token, 'getChatMenuButton', chatId ? { chat_id: chatId } : null);
}

async function setMenu(token, chatId, baseUrl, text, menuPath = '/') {
  const appUrl = urlForChat(baseUrl, chatId, menuPath);
  const menuButton = {
    type: 'web_app',
    text,
    web_app: { url: appUrl },
  };
  await telegramCall(token, 'setChatMenuButton', {
    chat_id: chatId,
    menu_button: JSON.stringify(menuButton),
  });
  return getMenu(token, chatId);
}

function runCommand(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(' ')}`);
}

const echoToStdout = (text) => process.stdout.write(text);

/**
 * Echoes the child's output and resolves with the first truthy `find(all output so far)`: what is looked for can
 * span chunks. Rejects with `fail(reason, output)` when the child exits, cannot start or finds nothing in time.
 */
function waitForOutput(child, { find, timeoutMs, fail, echo = echoToStdout }) {
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => settle(reject, fail(`not ready within ${timeoutMs}ms`, output)), timeoutMs);
    const onData = (data) => {
      const text = data.toString();
      echo(text);
      if (settled) return;
      output += text;
      const found = find(output);
      if (found) settle(resolve, found);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    // 'close', not 'exit': by then all the output is read, the last line too — that is where cloudflared puts the error
    child.on('close', (code) => settle(reject, fail(`exited with code ${code}`, output)));
    // A binary that cannot be started emits 'error', not 'exit'
    child.on('error', (error) => settle(reject, fail(`could not start: ${error.message}`, output)));
  });
}

// cloudflared prints the new tunnel's address in a box, on the line after this one. Any trycloudflare.com address
// before it is not the tunnel: without the network cloudflared names the API it could not reach,
// «failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": …» (FT-170).
const TUNNEL_CREATED = /Your quick Tunnel has been created!/i;
const TUNNEL_URL_PATTERN = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i;

/** The address of the quick tunnel cloudflared reports in `output`, or null until it has reported one. */
function tunnelUrlFrom(output) {
  const created = output.match(TUNNEL_CREATED);
  if (!created) return null;
  const url = output.slice(created.index + created[0].length).match(TUNNEL_URL_PATTERN);
  return url ? url[0] : null;
}

function tunnelFailure(reason, output) {
  const lastLine = output.trim().split(/\r?\n/).pop();
  const said = lastLine ? `: ${lastLine}` : '';
  const hint = /failed to request quick Tunnel/i.test(output) ? ' Cloudflare is out of reach — is the network up?' : '';
  // No full stop at the end: the supervisor adds «. Next attempt in 30 s.» after the message
  return new Error(`cloudflared did not open a quick tunnel (${reason})${said}.${hint} WEB_APP_URL and the Telegram menu button are unchanged`);
}

// cloudflared's answer when Cloudflare has deleted a quick tunnel — what happens while the machine sleeps. A dropped
// connection («Failed to dial a quic connection») is not this: cloudflared reconnects to the same tunnel by itself.
function isTunnelGone(text) {
  return /Tunnel not found/i.test(text);
}

// Pause before the next attempt to bring the tunnel back: 30 s, twice as long each time, at most 5 minutes.
function retryDelayMs(attempt) {
  return Math.min(30_000 * 2 ** attempt, 300_000);
}

/**
 * Brings the tunnel back once at a time, however often cloudflared repeats that it is gone. `recover` opens a new
 * tunnel and points everything at it; it throws while that cannot work yet (no network after waking up) and is tried
 * again after `retryDelayMs`. Returns `lost(reason)`, called on every sign of a lost tunnel; it resolves once the
 * tunnel is back, or at once when a recovery is already under way.
 */
function createTunnelSupervisor({ recover, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = console.log }) {
  let recovering = false;
  return async function lost(reason) {
    if (recovering) return;
    recovering = true;
    log(`Tunnel lost (${reason}); opening a new one ...`);
    for (let attempt = 0; ; attempt += 1) {
      try {
        await recover();
        break;
      } catch (error) {
        const delay = retryDelayMs(attempt);
        log(`Could not bring the tunnel back: ${error.message}. Next attempt in ${Math.round(delay / 1000)} s.`);
        await wait(delay);
      }
    }
    recovering = false;
  };
}

// Used at start and when the tunnel comes back after sleep. It throws before WEB_APP_URL or the menu button is touched.
async function openTunnel(cloudflared, port, { timeoutMs = 45000, echo } = {}) {
  const child = spawn(cloudflared, ['tunnel', '--url', `http://127.0.0.1:${port}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await waitForOutput(child, { find: tunnelUrlFrom, timeoutMs, fail: tunnelFailure, echo });
    return { child, url };
  } catch (error) {
    if (child.exitCode === null) child.kill('SIGTERM');
    throw error;
  }
}

async function waitUntilPortFree(port, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  while (await isPortListening(port)) {
    if (Date.now() > until) throw new Error(`port ${port} is still busy`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

// Whether something accepts connections on the port — by connecting, as `ss` is Linux-only.
function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: Number(port), host: '127.0.0.1' });
    const done = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function probe(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, { timeout: 10000 }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(0));
  });
}

async function commandStatus({ flags }) {
  const envFile = envFileFor(flags);
  const env = { ...readEnv(envFile), ...process.env };
  const chatId = flags['chat-id'] || flags.chatId || env.MINIAPP_CHAT_ID || env.TELEGRAM_CHAT_ID;
  const currentUrl = env.WEB_APP_URL || env.NGROK_URL || '';

  console.log(`envFile=${path.relative(root, envFile)}`);
  if (currentUrl) {
    const parsed = new URL(currentUrl);
    console.log(`WEB_APP_URL scheme=${parsed.protocol.replace(':', '')} host=${parsed.host} path=${parsed.pathname}`);
  } else {
    console.log('WEB_APP_URL missing');
  }
  console.log(`TG_BOT_API_KEY=${env.TG_BOT_API_KEY ? 'present' : 'missing'}`);
  console.log(`chatId=${chatId || 'missing'}`);

  if (env.TG_BOT_API_KEY && chatId) {
    const menu = await getMenu(env.TG_BOT_API_KEY, chatId);
    console.log(`menu.type=${menu.type}`);
    if (menu.web_app?.url) console.log(`menu.url=${menu.web_app.url}`);
  }
}

async function commandSet({ flags }) {
  const envFile = envFileFor(flags);
  const env = { ...readEnv(envFile), ...process.env };
  const chatId = flags['chat-id'] || flags.chatId || env.MINIAPP_CHAT_ID || env.TELEGRAM_CHAT_ID;
  const baseUrl = flags.url || env.WEB_APP_URL || env.NGROK_URL;
  const menuText = flags['menu-text'] || env.MINIAPP_MENU_TEXT || DEFAULT_MENU_TEXT;

  if (!chatId) throw new Error('Missing --chat-id (or MINIAPP_CHAT_ID / TELEGRAM_CHAT_ID)');
  if (!baseUrl) throw new Error('Missing --url (or WEB_APP_URL)');

  const normalized = normalizeBaseUrl(baseUrl);
  // --path points only the menu button at another page (e.g. /dev/voice-check); WEB_APP_URL stays
  // the app root so links the bot builds keep working.
  const menuPath = typeof flags.path === 'string' ? flags.path : '/';
  if (menuPath === '/') {
    writeEnvValue(envFile, 'WEB_APP_URL', normalized);
    console.log(`Updated ${path.relative(root, envFile)} WEB_APP_URL=${normalized}`);
  } else {
    console.log(`WEB_APP_URL unchanged; only the menu button opens ${menuPath}`);
  }

  if (flags['no-menu']) {
    console.log('Skipped Telegram menu update (--no-menu).');
    return;
  }

  const menu = await setMenu(env.TG_BOT_API_KEY, chatId, normalized, menuText, menuPath);
  console.log(`Telegram menu updated: type=${menu.type} url=${menu.web_app?.url || 'n/a'}`);
}

async function commandRun({ flags }) {
  const envFile = envFileFor(flags);
  const env = { ...readEnv(envFile), ...process.env };
  const chatId = flags['chat-id'] || flags.chatId || env.MINIAPP_CHAT_ID || env.TELEGRAM_CHAT_ID;
  const port = Number(flags.port || env.PORT || DEFAULT_PORT);
  const menuText = flags['menu-text'] || env.MINIAPP_MENU_TEXT || DEFAULT_MENU_TEXT;
  const setFlags = (url) => ({ ...flags, url, 'chat-id': chatId, 'env-file': envFile, 'menu-text': menuText });
  // The tunnel and the server this helper runs now; both are replaced when the tunnel comes back
  let tunnel = null;
  let server = null;
  let stopping = false;
  let finish = () => undefined;
  const finished = new Promise((resolve) => { finish = resolve; });

  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const child of [tunnel, server]) {
      if (child && child.exitCode === null) child.kill('SIGTERM');
    }
    finish();
    setTimeout(() => process.exit(0), 500).unref();
  };

  let cloudflared = null;
  if (!flags.url) {
    cloudflared = findCloudflared();
    if (!cloudflared || !fs.existsSync(cloudflared)) {
      throw new Error(`cloudflared not found${cloudflared ? ` at ${cloudflared}` : ' in ~/.local/bin or on PATH'}; set CLOUDFLARED_BIN`);
    }
    console.log(`Starting Cloudflare tunnel to http://127.0.0.1:${port} ...`);
    const opened = await openTunnel(cloudflared, port);
    tunnel = opened.child;
    flags.url = opened.url;
  }

  await commandSet({ flags: setFlags(flags.url) });

  if (!flags['skip-build']) {
    runCommand('npm', ['run', 'build:webapp']);
    runCommand('npm', ['run', 'build']);
  }

  const startServer = async () => {
    const child = spawn('npm', ['run', 'serve'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    server = child;
    child.on('exit', (code) => {
      if (child !== server || stopping) return;
      console.error(`Server exited (code=${code}); stopping the helper.`);
      stop();
    });
    await waitForOutput(child, {
      find: (output) => /Server started/.test(output),
      timeoutMs: 45000,
      fail: (reason) => new Error(`server ${reason}`),
    });
  };

  // The server reads WEB_APP_URL once, at start, for the links the bot sends: a new tunnel needs a new server
  const restartServer = async () => {
    const old = server;
    server = null;
    if (old && old.exitCode === null) {
      const exited = new Promise((resolve) => old.once('exit', resolve));
      old.kill('SIGTERM');
      await exited;
    }
    await waitUntilPortFree(port);
    await startServer();
  };

  const alreadyListening = await isPortListening(port);
  if (flags['no-serve']) {
    console.log('Skipped server start (--no-serve).');
  } else if (alreadyListening) {
    console.warn(`Port ${port} is already listening. Not starting another server.`);
    console.warn('If it was started before WEB_APP_URL changed, restart it before using /start inline buttons.');
  } else {
    console.log('Starting npm run serve ...');
    await startServer();
  }

  if (tunnel) {
    let lost = () => undefined;
    const watchTunnel = (child) => {
      const onData = (data) => {
        if (child === tunnel && !stopping && isTunnelGone(data.toString())) lost('Cloudflare no longer knows it');
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('exit', (code) => {
        if (child === tunnel && !stopping) lost(`cloudflared exited, code=${code}`);
      });
    };
    lost = createTunnelSupervisor({
      recover: async () => {
        const old = tunnel;
        tunnel = null;
        if (old && old.exitCode === null) old.kill('SIGTERM');
        const opened = await openTunnel(cloudflared, port);
        tunnel = opened.child;
        watchTunnel(opened.child);
        await commandSet({ flags: setFlags(opened.url) });
        const menuNote = flags['no-menu'] ? 'menu button left as it was (--no-menu)' : 'menu button updated';
        if (server) {
          await restartServer();
          console.log(`Tunnel is back: ${opened.url} — ${menuNote}, server restarted.`);
        } else {
          console.log(`Tunnel is back: ${opened.url} — ${menuNote}.`);
          console.warn('The server was not started by this helper: restart it so the bot links use the new address.');
        }
      },
    });
    watchTunnel(tunnel);
  }

  const healthUrl = `${normalizeBaseUrl(flags.url)}/health`;
  const appUrl = urlForChat(flags.url, chatId);
  const status = await probe(appUrl);
  console.log(`Mini App URL: ${appUrl}`);
  console.log(`Public app probe: HTTP ${status}`);
  console.log(`Health URL: ${healthUrl}`);
  console.log('Ready. Press Ctrl+C to stop child tunnel/server processes started by this helper.');
  if (tunnel) console.log('If Cloudflare drops the tunnel (the machine slept), a new one is opened and the menu button follows it.');

  if (!tunnel && !server) return;

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await finished;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.flags.help || parsed.command === 'help') {
    printHelp();
    return;
  }

  if (parsed.command === 'status') return commandStatus(parsed);
  if (parsed.command === 'set') return commandSet(parsed);
  if (parsed.command === 'run') return commandRun(parsed);
  throw new Error(`Unknown command: ${parsed.command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  envFileFor, findCloudflared, isPortListening, isTunnelGone, retryDelayMs, createTunnelSupervisor, tunnelUrlFrom, openTunnel,
  telegramCall,
};
