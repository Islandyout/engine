// Ensures at most one completion callback is registered per key while a load
// for that key is in flight — even if `loadOnce` is called many times for the
// same key before it settles (e.g. once per entity in a scene that places the
// same not-yet-cached model many times). `start()` itself may already
// memoize/dedupe the underlying work (the caller's own promise cache); this
// only prevents attaching N redundant "it's done" handlers to that one
// promise, each of which would otherwise independently trigger whatever N
// callers wanted to happen once it resolves.
export function loadOnce<T>(
  pending: Set<number>,
  key: number,
  start: () => Promise<T> | undefined,
  onResolve: (value: T) => void,
  onReject: (error: unknown) => void,
): void {
  if (pending.has(key)) return;
  const promise = start();
  if (!promise) return;
  pending.add(key);
  promise.then(
    (value) => {
      pending.delete(key);
      onResolve(value);
    },
    (error: unknown) => {
      pending.delete(key);
      onReject(error);
    },
  );
}
