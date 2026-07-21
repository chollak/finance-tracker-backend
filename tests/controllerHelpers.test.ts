import { handleResultResponse } from '../src/shared/infrastructure/utils/controllerHelpers';
import { ValidationError } from '../src/shared/domain/errors/AppError';

function createMockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('controllerHelpers handleResultResponse', () => {
  it('sends a success response and returns true for successful results', () => {
    const res = createMockResponse();

    const handled = handleResultResponse(
      { success: true, data: { id: 'item-1' } },
      res,
      201,
      'Created successfully'
    );

    expect(handled).toBe(true);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { id: 'item-1' },
      message: 'Created successfully',
    }));
  });

  it('sends an AppError response and returns false for failed results', () => {
    const res = createMockResponse();

    const handled = handleResultResponse(
      { success: false, error: new ValidationError('bad input', 'field') },
      res
    );

    expect(handled).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'bad input',
      }),
    }));
  });
});
