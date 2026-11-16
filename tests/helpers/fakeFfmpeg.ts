/**
 * `child_process` with ffmpeg faked, for a suite that runs voice through ProcessVoiceInputUseCase (#295):
 *
 *   jest.mock('child_process', () => jest.requireActual('./helpers/fakeFfmpeg').childProcessWithFakeFfmpeg());
 *
 * The fake «converts» by copying the voice to the `.mp3` at once; a voice that is not there (a test that fakes `fs`)
 * fails the conversion, and the use case renames it instead, as with a real failure. Without it every voice test started
 * a real ffmpeg on fake audio: one more process each, slow on a loaded machine (5 s timeouts of voice suites in a busy
 * `verify`), and a different path depending on whether ffmpeg is installed.
 */
export function childProcessWithFakeFfmpeg() {
  const actual = jest.requireActual('child_process');
  const { EventEmitter } = jest.requireActual('events');
  const files = jest.requireActual('fs');
  return {
    ...actual,
    spawn: jest.fn((_command: string, args: string[]) => {
      const ffmpeg = new EventEmitter();
      setImmediate(() => {
        try {
          files.copyFileSync(args[args.indexOf('-i') + 1], args[args.length - 1]);
          ffmpeg.emit('close', 0, null);
        } catch {
          ffmpeg.emit('close', 1, null);
        }
      });
      return ffmpeg;
    }),
  };
}
