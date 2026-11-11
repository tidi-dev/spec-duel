export type HttpResult<T> = {
  status: number;
  headers: Headers;
  body: T;
};

export type RequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
};

const gatewayUrl = (): string => {
  const url = process.env.GATEWAY_URL;
  if (!url) {
    throw new Error('GATEWAY_URL is not set (for example http://localhost:3100/api).');
  }
  return url.replace(/\/$/, '');
};

export const request = async <T = unknown>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<HttpResult<T>> => {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${gatewayUrl()}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: unknown = undefined;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, headers: response.headers, body: body as T };
};

export const get = <T = unknown>(path: string): Promise<HttpResult<T>> => request<T>('GET', path);
