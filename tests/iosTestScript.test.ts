import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * `ios/scripts/test.sh` (#323): the run a PR that changes `ios/` must pass before the merge. Each test runs the real
 * script, copied into a scratch `ios/`, with `xcrun` and `xcodebuild` replaced by stand-ins on PATH: what it asks
 * `xcodebuild` for and how it ends when the machine has no simulator to run on.
 */

const SCRIPT = path.join(__dirname, '..', 'ios', 'scripts', 'test.sh');
const PRO = '75096F81-2557-4BFD-98C4-C2F93CA06937';
const AIR = 'C48F27FF-A7AC-4156-825D-345448E839A2';
const SIMULATORS = [
  '== Devices ==',
  '-- iOS 27.1 --',
  `    iPhone 17 Pro (${PRO}) (Shutdown) `,
  `    iPhone Air (${AIR}) (Shutdown) `,
  '    iPad Pro 13-inch (M5) (0A1B2C3D-0000-4000-8000-000000000001) (Shutdown) ',
].join('\n');

let root: string;
let bin: string;
let calls: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-test-sh-'));
  bin = path.join(root, 'bin');
  calls = path.join(root, 'xcodebuild.args');
  fs.mkdirSync(path.join(root, 'ios', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ios', 'Kapelka.xcodeproj'));
  fs.mkdirSync(bin);
  fs.copyFileSync(SCRIPT, path.join(root, 'ios', 'scripts', 'test.sh'));
  fs.writeFileSync(path.join(root, 'ios', 'Kapelka.xcodeproj', 'project.pbxproj'), '// no team\n');
  standIn('xcodebuild', `printf '%s\\n' "$@" > "${calls}"\nexit "\${XCODEBUILD_EXIT:-0}"`);
  simulators(SIMULATORS);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function standIn(name: string, body: string): void {
  fs.writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
}

/** What `xcrun simctl list devices available` prints */
function simulators(list: string): void {
  fs.writeFileSync(path.join(root, 'simulators.txt'), `${list}\n`);
  standIn('xcrun', `cat "${path.join(root, 'simulators.txt')}"`);
}

function run(env: Record<string, string> = {}, args: string[] = []) {
  const result = spawnSync('bash', [path.join(root, 'ios', 'scripts', 'test.sh'), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: root, ...env },
  });
  return { code: result.status, stderr: result.stderr };
}

function xcodebuildArgs(): string[] | null {
  return fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trimEnd().split('\n') : null;
}

function valueOf(flag: string): string | undefined {
  const args = xcodebuildArgs() ?? [];
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe('ios/scripts/test.sh', () => {
  it('runs the tests on the first available iPhone and never collects simulator diagnostics', () => {
    const { code } = run();

    expect(code).toBe(0);
    expect(xcodebuildArgs()?.[0]).toBe('test');
    expect(valueOf('-destination')).toBe(`platform=iOS Simulator,id=${PRO}`);
    expect(valueOf('-collect-test-diagnostics')).toBe('never');
  });

  it('passes its own arguments on to xcodebuild', () => {
    run({}, ['-only-testing:KapelkaTests/OutboxTests']);

    expect(xcodebuildArgs()).toContain('-only-testing:KapelkaTests/OutboxTests');
  });

  it('takes a simulator named in KAPELKA_SIMULATOR, by name or by UDID', () => {
    run({ KAPELKA_SIMULATOR: 'iPhone Air' });
    expect(valueOf('-destination')).toBe('platform=iOS Simulator,name=iPhone Air');

    run({ KAPELKA_SIMULATOR: AIR });
    expect(valueOf('-destination')).toBe(`platform=iOS Simulator,id=${AIR}`);
  });

  it('ends with the code of xcodebuild when the tests are red', () => {
    expect(run({ XCODEBUILD_EXIT: '65' }).code).toBe(65);
  });

  it('ends with code 2 and says what to install when there is no iPhone simulator', () => {
    simulators('== Devices ==\n-- iOS 27.1 --\n    iPad Pro 13-inch (M5) (0A1B2C3D-0000-4000-8000-000000000001) (Shutdown) ');

    const { code, stderr } = run();

    expect(code).toBe(2);
    expect(stderr).toContain('No iPhone simulator');
    expect(stderr).toContain('the tests did not run');
    expect(xcodebuildArgs()).toBeNull();
  });

  it('ends with code 2 and lists the simulators when the named one is not installed', () => {
    const { code, stderr } = run({ KAPELKA_SIMULATOR: 'iPhone 17' });

    expect(code).toBe(2);
    expect(stderr).toContain('No simulator "iPhone 17"');
    expect(stderr).toContain('iPhone 17 Pro');
    expect(stderr).toContain('iPhone Air');
    expect(xcodebuildArgs()).toBeNull();
  });

  it('ends with code 2 when Xcode cannot list simulators at all', () => {
    standIn('xcrun', 'echo "xcrun: error: invalid active developer path" >&2\nexit 1');

    const { code, stderr } = run();

    expect(code).toBe(2);
    expect(stderr).toContain('invalid active developer path');
    expect(stderr).toContain('the tests did not run');
    expect(xcodebuildArgs()).toBeNull();
  });

  it('still refuses a project that holds a Team ID, with code 1', () => {
    fs.writeFileSync(
      path.join(root, 'ios', 'Kapelka.xcodeproj', 'project.pbxproj'),
      'DEVELOPMENT_TEAM = ABCDE12345;\n',
    );

    expect(run().code).toBe(1);
    expect(xcodebuildArgs()).toBeNull();
  });
});
