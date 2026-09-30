/** Let the browser paint and handle input between geometry batches. */
export function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    // Unlike nested timers, message tasks do not acquire a minimum 4 ms delay.
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/** Publish a complete result only; an obsolete render must never replace newer geometry. */
export async function mapInBatches<T, R>(
  items: readonly T[],
  map: (item: T) => R,
  isCancelled: () => boolean,
  budgetMs = 8,
): Promise<R[] | null> {
  const result: R[] = [];
  let deadline = performance.now() + budgetMs;
  for (const item of items) {
    if (isCancelled()) return null;
    result.push(map(item));
    if (performance.now() >= deadline) {
      await yieldToMainThread();
      deadline = performance.now() + budgetMs;
    }
  }
  return isCancelled() ? null : result;
}
