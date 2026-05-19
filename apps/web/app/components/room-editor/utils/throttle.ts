/**
 * Returns a throttled version of a function that fires at most every `ms` milliseconds.
 * If `leading` is true, fires immediately on first call.
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
  leading = true,
): (...args: Parameters<T>) => void {
  let last = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const elapsed = now - last;

    if (elapsed >= ms) {
      last = now;
      fn(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        last = Date.now();
        timeout = null;
        fn(...args);
      }, ms - elapsed);
    }
  };
}
