import { spawnSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

/**
 * `npm run dev:miniapp` on macOS as well as WSL: the env file it updates is the one the app reads, cloudflared is
 * found where Homebrew puts it, and a busy port is seen without the Linux-only `ss`.
 */
const {
  envFileFor, findCloudflared, isPortListening, isTunnelGone, retryDelayMs, createTunnelSupervisor, tunnelUrlFrom, openTunnel,
// eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../scripts/dev-miniapp.js');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'dev-miniapp.js');

// What cloudflared 2026.9.3 printed to stderr for `cloudflared tunnel --url http://127.0.0.1:1` on 2026-10-29 (macOS).
const STARTING = [
  '2026-10-29T04:55:37Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out. However, be aware that these account-less Tunnels have no uptime guarantee, are subject to the Cloudflare Online Services Terms of Use (https://www.cloudflare.com/website-terms/), and Cloudflare reserves the right to investigate your use of Tunnels for violations of such terms. If you intend to use Tunnels in production you should use a pre-created named tunnel by following: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps',
  '2026-10-29T04:55:37Z INF Requesting new quick Tunnel on trycloudflare.com...',
];
// With the network
const CREATED = [
  '2026-10-29T04:55:42Z INF +--------------------------------------------------------------------------------------------+',
  '2026-10-29T04:55:42Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |',
  '2026-10-29T04:55:42Z INF |  https://kerry-wait-activated-pro.trycloudflare.com                                        |',
  '2026-10-29T04:55:42Z INF +--------------------------------------------------------------------------------------------+',
  '2026-10-29T04:55:42Z INF Registered tunnel connection connIndex=0 connection=7d0a8c0f-2a83-4518-acb6-1d4e49a0f6c4 event=0 ip=198.41.192.77 location=waw03 protocol=quic',
];
// Without it (outgoing connections blocked by sandbox-exec); cloudflared exits with code 1 after this line
const NO_NETWORK = 'failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp 104.16.231.132:443: connect: operation not permitted';
// The incident of 2026-10-28 (FT-170): the Mac had no network
const TIMED_OUT = 'failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": context deadline exceeded';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-miniapp-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function touch(...parts: string[]): string {
  const file = path.join(dir, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  return file;
}

function executable(...parts: string[]): string {
  const file = touch(...parts);
  fs.chmodSync(file, 0o755);
  return file;
}

describe('the env file', () => {
  it('is .env.local when there is one, as the app reads only it then', () => {
    touch('.env');
    touch('.env.local');
    expect(envFileFor({}, dir)).toBe(path.join(dir, '.env.local'));
  });

  it('is .env without .env.local', () => {
    touch('.env');
    expect(envFileFor({}, dir)).toBe(path.join(dir, '.env'));
  });

  it('is the one --env-file names', () => {
    touch('.env.local');
    expect(envFileFor({ 'env-file': '.env' }, dir)).toBe(path.join(dir, '.env'));
  });
});

describe('cloudflared', () => {
  it('is CLOUDFLARED_BIN when it is set', () => {
    expect(findCloudflared({ CLOUDFLARED_BIN: '/opt/cf', HOME: dir, PATH: '' })).toBe('/opt/cf');
  });

  it('is ~/.local/bin/cloudflared when it is there', () => {
    const local = executable('.local', 'bin', 'cloudflared');
    const brew = executable('brew', 'cloudflared');
    expect(findCloudflared({ HOME: dir, PATH: path.dirname(brew) })).toBe(local);
  });

  it('is found on PATH otherwise, as Homebrew installs it', () => {
    const brew = executable('brew', 'cloudflared');
    expect(findCloudflared({ HOME: dir, PATH: ['/nowhere', path.dirname(brew)].join(path.delimiter) })).toBe(brew);
  });

  it('is not a folder or a file that cannot run, which happen to have its name', () => {
    fs.mkdirSync(path.join(dir, 'a', 'cloudflared'), { recursive: true });
    touch('b', 'cloudflared');
    const brew = executable('brew', 'cloudflared');
    const PATH = [path.join(dir, 'a'), path.join(dir, 'b'), path.dirname(brew)].join(path.delimiter);
    expect(findCloudflared({ HOME: dir, PATH })).toBe(brew);
  });

  it('is missing when it is nowhere', () => {
    expect(findCloudflared({ HOME: dir, PATH: '/nowhere' })).toBeNull();
  });
});

describe('the address of a new quick tunnel', () => {
  it('is the one in the box cloudflared prints once the tunnel is created', () => {
    expect(tunnelUrlFrom([...STARTING, ...CREATED].join('\n'))).toBe('https://kerry-wait-activated-pro.trycloudflare.com');
  });

  it('is not the API cloudflared failed to reach, without the network (FT-170)', () => {
    expect(tunnelUrlFrom([...STARTING, TIMED_OUT].join('\n'))).toBeNull();
    expect(tunnelUrlFrom([...STARTING, NO_NETWORK].join('\n'))).toBeNull();
  });

  it('is not known yet while only the first lines of the box have come', () => {
    expect(tunnelUrlFrom([...STARTING, ...CREATED.slice(0, 2)].join('\n'))).toBeNull();
  });
});

/** A stand-in for cloudflared: prints `lines` to stderr, `pause` seconds apart, then exits with `exit` or keeps running. */
function fakeCloudflared(lines: string[], { exit, pause = 0 }: { exit?: number; pause?: number } = {}): string {
  const file = executable('bin', 'cloudflared');
  const body = lines.map((line) => `printf '%s\\n' '${line.replace(/'/g, "'\\''")}' >&2${pause ? `\nsleep ${pause}` : ''}`);
  fs.writeFileSync(file, ['#!/bin/sh', ...body, exit === undefined ? 'exec sleep 30' : `exit ${exit}`].join('\n'));
  return file;
}

describe('opening a quick tunnel, at start and again after the machine slept', () => {
  const quiet = () => undefined;
  let child: ChildProcess | undefined;

  afterEach(() => {
    if (child && child.exitCode === null) child.kill('SIGKILL');
    child = undefined;
  });

  it('gives the address cloudflared printed, also when the box comes line by line', async () => {
    const bin = fakeCloudflared([...STARTING, ...CREATED], { pause: 0.05 });
    const opened = await openTunnel(bin, 1, { echo: quiet });
    child = opened.child;
    expect(opened.url).toBe('https://kerry-wait-activated-pro.trycloudflare.com');
  });

  it('fails, saying what cloudflared said, when cloudflared could not get a tunnel', async () => {
    const bin = fakeCloudflared([...STARTING, TIMED_OUT], { exit: 1 });
    await expect(openTunnel(bin, 1, { echo: quiet })).rejects.toThrow(
      /did not open a quick tunnel.*context deadline exceeded.*WEB_APP_URL and the Telegram menu button are unchanged/,
    );
  });

  it('fails when cloudflared names no tunnel in time', async () => {
    const bin = fakeCloudflared(STARTING);
    await expect(openTunnel(bin, 1, { echo: quiet, timeoutMs: 300 })).rejects.toThrow(
      /did not open a quick tunnel.*Requesting new quick Tunnel.*unchanged/,
    );
  });
});

describe('dev:miniapp without the network', () => {
  it('stops with a clear error and leaves the env file alone, before any Telegram call', () => {
    const envFile = path.join(dir, '.env.local');
    const before = 'WEB_APP_URL=https://kerry-wait-activated-pro.trycloudflare.com\nPORT=3999\n';
    fs.writeFileSync(envFile, before);
    const bin = fakeCloudflared([...STARTING, NO_NETWORK], { exit: 1 });

    // No TG_BOT_API_KEY: a run that went on to the menu button would fail on it, not on the tunnel
    const run = spawnSync(process.execPath, [SCRIPT, 'run', '--chat-id=1', `--env-file=${envFile}`, '--skip-build', '--no-serve'], {
      env: { PATH: process.env.PATH, HOME: dir, CLOUDFLARED_BIN: bin },
      encoding: 'utf8',
      timeout: 10_000,
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('did not open a quick tunnel');
    expect(run.stderr).toContain('Cloudflare is out of reach');
    expect(run.stderr).not.toContain('TG_BOT_API_KEY');
    expect(run.stdout).not.toContain('Updated');
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
  });
});

describe('a quick tunnel that is gone (the machine slept)', () => {
  it('is what cloudflared says when Cloudflare no longer knows the tunnel', () => {
    expect(isTunnelGone(
      '2026-10-23T05:50:18Z ERR Register tunnel error from server side error="Unauthorized: Tunnel not found" connIndex=0'
    )).toBe(true);
  });

  it('is not a dropped connection cloudflared reconnects by itself', () => {
    expect(isTunnelGone(
      '2026-10-21T16:55:46Z ERR Failed to dial a quic connection error="failed to dial to edge with quic: timeout: no recent network activity"'
    )).toBe(false);
    expect(isTunnelGone('INF Registered tunnel connection connIndex=0 location=waw06 protocol=quic')).toBe(false);
  });
});

describe('bringing the tunnel back', () => {
  const quiet = () => undefined;

  it('waits 30 s, then twice as long each time, at most 5 minutes', () => {
    expect([0, 1, 2, 3, 4, 10].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
  });

  it('happens once, however often cloudflared repeats that the tunnel is gone', async () => {
    let finish: () => void = () => undefined;
    const recover = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const lost = createTunnelSupervisor({ recover, log: quiet });

    const first = lost('gone');
    await lost('gone');
    await lost('gone');
    finish();
    await first;

    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('tries again while there is no network, with growing pauses, until it works', async () => {
    const recover = jest.fn()
      .mockRejectedValueOnce(new Error('cloudflared did not become ready'))
      .mockRejectedValueOnce(new Error('Telegram setChatMenuButton failed'))
      .mockResolvedValueOnce(undefined);
    const wait = jest.fn(async () => undefined);

    await createTunnelSupervisor({ recover, wait, log: quiet })('gone');

    expect(recover).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[30_000], [60_000]]);
  });

  it('happens again when the tunnel is lost again later', async () => {
    const recover = jest.fn(async () => undefined);
    const lost = createTunnelSupervisor({ recover, log: quiet });

    await lost('gone');
    await lost('gone');

    expect(recover).toHaveBeenCalledTimes(2);
  });
});

describe('a busy port', () => {
  it('is seen while something listens on it, and not after', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as net.AddressInfo;

    expect(await isPortListening(port)).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortListening(port)).toBe(false);
  });
});
