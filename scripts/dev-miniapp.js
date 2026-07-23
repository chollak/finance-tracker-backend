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
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const DEFAULT_ENV_FILE = path.join(root, '.env');
const DEFAULT_PORT = 3000;
const DEFAULT_MENU_TEXT = 'Finance DEV';

function printHelp() {
  console.log(`Finance Tracker Telegram Mini App helper\n\nUsage:\n  npm run dev:miniapp -- --chat-id=<telegram_chat_id> [--skip-build]\n  npm run miniapp:menu -- status --chat-id=<telegram_chat_id>\n  npm run miniapp:menu -- set --url=<https_url> --chat-id=<telegram_chat_id>\n\nOptions:\n  --chat-id, --chatId       Telegram chat/user id for the persistent menu button\n  --url                    Public HTTPS Mini App URL for set/status checks\n  --env-file               Env file to update (default: .env)\n  --menu-text              Telegram menu button text (default: Finance DEV)\n  --port                   Backend port (default: 3000)\n  --skip-build             Skip npm run build:webapp && npm run build before serve\n  --no-serve               Only create/update tunnel/menu; do not start npm run serve\n  --no-menu                Do not call Telegram setChatMenuButton\n  --help                   Show help\n\nNotes:\n  - For Telegram Mini App on a phone, WEB_APP_URL must be public HTTPS.\n  - Old inline buttons keep their embedded URL; send /start after a tunnel change.\n  - The persistent chat menu button must be updated separately; this helper does it.\n`);
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

function urlForChat(baseUrl, chatId) {
  const url = new URL('/', normalizeBaseUrl(baseUrl));
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
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function telegramCall(token, method, body = null) {
  if (!token) throw new Error('TG_BOT_API_KEY is missing in env file or process env');
  const response = await requestJson(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    body,
  });
  if (!response.json.ok) {
    throw new Error(`Telegram ${method} failed: ${response.json.description || `HTTP ${response.status}`}`);
  }
  return response.json.result;
}

async function getMenu(token, chatId) {
  return telegramCall(token, 'getChatMenuButton', chatId ? { chat_id: chatId } : null);
}

async function setMenu(token, chatId, baseUrl, text) {
  const appUrl = urlForChat(baseUrl, chatId);
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

function waitForOutput(child, regex, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not become ready within ${timeoutMs}ms`)), timeoutMs);
    const onData = (data) => {
      const text = data.toString();
      process.stdout.write(text);
      const match = text.match(regex);
      if (match) {
        clearTimeout(timer);
        resolve(match);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`${label} exited before readiness (code=${code})`));
    });
  });
}

function isPortListening(port) {
  const result = spawnSync('bash', ['-lc', `ss -ltn | grep -q ':${Number(port)}\\b'`], { stdio: 'ignore' });
  return result.status === 0;
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
  const envFile = path.resolve(root, flags['env-file'] || DEFAULT_ENV_FILE);
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
  const envFile = path.resolve(root, flags['env-file'] || DEFAULT_ENV_FILE);
  const env = { ...readEnv(envFile), ...process.env };
  const chatId = flags['chat-id'] || flags.chatId || env.MINIAPP_CHAT_ID || env.TELEGRAM_CHAT_ID;
  const baseUrl = flags.url || env.WEB_APP_URL || env.NGROK_URL;
  const menuText = flags['menu-text'] || env.MINIAPP_MENU_TEXT || DEFAULT_MENU_TEXT;

  if (!chatId) throw new Error('Missing --chat-id (or MINIAPP_CHAT_ID / TELEGRAM_CHAT_ID)');
  if (!baseUrl) throw new Error('Missing --url (or WEB_APP_URL)');

  const normalized = normalizeBaseUrl(baseUrl);
  writeEnvValue(envFile, 'WEB_APP_URL', normalized);
  console.log(`Updated ${path.relative(root, envFile)} WEB_APP_URL=${normalized}`);

  if (flags['no-menu']) {
    console.log('Skipped Telegram menu update (--no-menu).');
    return;
  }

  const menu = await setMenu(env.TG_BOT_API_KEY, chatId, normalized, menuText);
  console.log(`Telegram menu updated: type=${menu.type} url=${menu.web_app?.url || 'n/a'}`);
}

async function commandRun({ flags }) {
  const envFile = path.resolve(root, flags['env-file'] || DEFAULT_ENV_FILE);
  const env = { ...readEnv(envFile), ...process.env };
  const chatId = flags['chat-id'] || flags.chatId || env.MINIAPP_CHAT_ID || env.TELEGRAM_CHAT_ID;
  const port = Number(flags.port || env.PORT || DEFAULT_PORT);
  const menuText = flags['menu-text'] || env.MINIAPP_MENU_TEXT || DEFAULT_MENU_TEXT;
  const children = [];

  if (!flags.url) {
    const cloudflared = process.env.CLOUDFLARED_BIN || path.join(process.env.HOME || '', '.local/bin/cloudflared');
    if (!fs.existsSync(cloudflared)) throw new Error(`cloudflared not found at ${cloudflared}; set CLOUDFLARED_BIN`);
    console.log(`Starting Cloudflare tunnel to http://127.0.0.1:${port} ...`);
    const tunnel = spawn(cloudflared, ['tunnel', '--url', `http://127.0.0.1:${port}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(tunnel);
    const match = await waitForOutput(tunnel, /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i, 45000, 'cloudflared');
    flags.url = match[1];
  }

  await commandSet({ flags: { ...flags, 'chat-id': chatId, 'env-file': envFile, 'menu-text': menuText } });

  if (!flags['skip-build']) {
    runCommand('npm', ['run', 'build:webapp']);
    runCommand('npm', ['run', 'build']);
  }

  const alreadyListening = isPortListening(port);
  if (flags['no-serve']) {
    console.log('Skipped server start (--no-serve).');
  } else if (alreadyListening) {
    console.warn(`Port ${port} is already listening. Not starting another server.`);
    console.warn('If it was started before WEB_APP_URL changed, restart it before using /start inline buttons.');
  } else {
    console.log('Starting npm run serve ...');
    const server = spawn('npm', ['run', 'serve'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    children.push(server);
    await waitForOutput(server, /Server started/, 45000, 'server');
  }

  const healthUrl = `${normalizeBaseUrl(flags.url)}/health`;
  const appUrl = urlForChat(flags.url, chatId);
  const status = await probe(appUrl);
  console.log(`Mini App URL: ${appUrl}`);
  console.log(`Public app probe: HTTP ${status}`);
  console.log(`Health URL: ${healthUrl}`);
  console.log('Ready. Press Ctrl+C to stop child tunnel/server processes started by this helper.');

  if (!children.length) return;

  const stop = () => {
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise((resolve) => children[children.length - 1].on('exit', resolve));
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

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
