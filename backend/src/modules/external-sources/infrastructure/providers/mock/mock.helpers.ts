/**
 * Shared helpers for the mock layer.
 * The artificial delay makes a mock call feel like a real network round-trip
 * during the demo. Masking keeps ID numbers presentable on screen.
 */

/** Simulate a realistic network round-trip (default 900–1600ms). */
export function simulateLatency(minMs = 900, maxMs = 1600): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** 1089468234 -> 10******34  (never show full national IDs on screen). */
export function maskIdentity(id: string): string {
  if (id.length < 4) return '****';
  return id.slice(0, 2) + '*'.repeat(id.length - 4) + id.slice(-2);
}

/** Deterministic timestamps for provenance. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function todayDateIso(): string {
  return new Date().toISOString().slice(0, 10);
}
