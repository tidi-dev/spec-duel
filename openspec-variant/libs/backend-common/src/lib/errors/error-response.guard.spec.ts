import { isErrorResponse } from './error-response.guard';

describe('isErrorResponse', () => {
  it('accepts an object with the three error fields', () => {
    expect(isErrorResponse({ statusCode: 404, errorCode: 'NOT_FOUND.ROOM', message: 'x' })).toBe(true);
  });

  it.each([
    ['statusCode', { errorCode: 'NOT_FOUND.ROOM', message: 'x' }],
    ['errorCode', { statusCode: 404, message: 'x' }],
    ['message', { statusCode: 404, errorCode: 'NOT_FOUND.ROOM' }],
  ])('rejects an object without %s', (_field, value) => {
    expect(isErrorResponse(value)).toBe(false);
  });

  it('rejects a field of the wrong type', () => {
    expect(isErrorResponse({ statusCode: '404', errorCode: 'NOT_FOUND.ROOM', message: 'x' })).toBe(false);
  });

  it.each([null, undefined, 'NOT_FOUND.ROOM', 404])('rejects the non-object %p', (value) => {
    expect(isErrorResponse(value)).toBe(false);
  });
});
