/**
 * Mock network layer. Every API function goes through `request` so latency,
 * failures and auth checks behave like a real backend. Swapping this file for
 * a fetch-based client is the only change needed to hit a real API.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const LATENCY_MS = { min: 250, max: 700 };

export function delay(ms = LATENCY_MS.min + Math.random() * (LATENCY_MS.max - LATENCY_MS.min)) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function request<T>(handler: () => T): Promise<T> {
  await delay();
  // structuredClone stops callers from mutating the "database" through references.
  return structuredClone(handler());
}
