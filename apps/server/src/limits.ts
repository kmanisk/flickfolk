// Bounded, lazy token buckets: no background cleanup job or external store.
export function createLimiter() {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return (key: string, capacity: number, intervalMs = 60_000) => {
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: capacity, at: now };
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + ((now - bucket.at) * capacity) / intervalMs,
    );
    bucket.at = now;
    if (!buckets.has(key) && buckets.size >= 5000)
      buckets.delete(buckets.keys().next().value!);
    buckets.set(key, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens--;
    return true;
  };
}
