import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

/**
 * `npm run dev:miniapp` on macOS as well as WSL: the env file it updates is the one the app reads, cloudflared is
 * found where Homebrew puts it, and a busy port is seen without the Linux-only `ss`.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { envFileFor, findCloudflared, isPortListening, isTunnelGone, retryDelayMs, createTunnelSupervisor } = require('../scripts/dev-miniapp.js');

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
