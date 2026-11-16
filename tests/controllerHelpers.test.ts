import { handleControllerError, handleControllerSuccess } from '../src/shared/infrastructure/utils/controllerHelpers';
import { AuthorizationError, NotFoundError, StorageError, ValidationError } from '../src/shared/domain/errors/AppError';
import { captureLogLines, levelOf, LogCapture } from './helpers/logLines';

function createMockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('controllerHelpers', () => {
  it('handleControllerSuccess sends the data with the status and the message', () => {
    const res = createMockResponse();

    handleControllerSuccess({ id: 'item-1' }, res, 201, 'Created successfully');

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { id: 'item-1' },
      message: 'Created successfully',
    }));
  });

  it('handleControllerError sends an AppError with its status and code', () => {
    const res = createMockResponse();

    handleControllerError(new ValidationError('bad input', 'field'), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR', message: 'bad input' }),
    }));
  });

  /**
   * #275: every 400 and 404 was written at `error`, so a wrong request read in the journal as a fault of the server.
   * A refusal (4xx) is a `warn` with its status and code; a fault (5xx, an unexpected exception) stays an `error`.
   */
  describe('the log level', () => {
    let logs: LogCapture;

    beforeEach(() => {
      logs = captureLogLines();
    });

    afterEach(() => logs.restore());

    const levelsOf = async () => (await logs.lines()).map(levelOf);

    it.each([
      ['400', new ValidationError('amount must be positive', 'amount')],
      ['403', new AuthorizationError('You do not have permission to access this transaction')],
      ['404', new NotFoundError('Transaction', 'record-1')],
    ])('a %s is a warn with its status and code', async (status, error) => {
      handleControllerError(error, createMockResponse());

      expect(await levelsOf()).toEqual(['warn']);
      const [line] = await logs.lines();
      expect(line).toContain(status);
      expect(line).toContain(error.code);
    });

    it('a 500 and an unexpected exception are errors', async () => {
      handleControllerError(new StorageError('Failed to read history'), createMockResponse());
      handleControllerError(new Error('boom'), createMockResponse());

      expect(await levelsOf()).toEqual(['error', 'error']);
    });
  });
});
