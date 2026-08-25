// 단일 프로세스 로컬 앱을 전제로 한 간단한 메모리 기반 로그인 시도 제한.
const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 15 * 60 * 1000; // 15분
const MAX_ATTEMPTS = 5;

export function checkRateLimit(key: string): { allowed: boolean; remainingMs: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { allowed: true, remainingMs: 0 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remainingMs: entry.resetAt - now };
  }
  return { allowed: true, remainingMs: 0 };
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearRateLimit(key: string): void {
  attempts.delete(key);
}
