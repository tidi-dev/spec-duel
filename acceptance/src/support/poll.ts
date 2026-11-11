const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const pollUntil = async <T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await sleep(500);
    value = await read();
  }
  return value;
};

export const wait = sleep;
