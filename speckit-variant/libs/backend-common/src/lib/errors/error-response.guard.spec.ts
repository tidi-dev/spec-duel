import { isErrorResponse } from './error-response.guard';

describe('isErrorResponse', () => {
  it('accepts an object with a numeric status, a string error code and a string message', () => {
    expect(isErrorResponse({ statusCode: 404, errorCode: 'NOT_FOUND.ROOM', message: 'x' })).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'NOT_FOUND.ROOM'],
    ['a missing statusCode', { errorCode: 'NOT_FOUND.ROOM', message: 'x' }],
    ['a missing errorCode', { statusCode: 404, message: 'x' }],
    ['a missing message', { statusCode: 404, errorCode: 'NOT_FOUND.ROOM' }],
    ['a string statusCode', { statusCode: '404', errorCode: 'NOT_FOUND.ROOM', message: 'x' }],
    ['a numeric errorCode', { statusCode: 404, errorCode: 404, message: 'x' }],
    ['a non-string message', { statusCode: 404, errorCode: 'NOT_FOUND.ROOM', message: ['x'] }],
  ])('rejects %s', (_case, value) => {
    expect(isErrorResponse(value)).toBe(false);
  });
});
