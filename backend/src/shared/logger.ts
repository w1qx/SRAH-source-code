/**
 * Structured logging, deliberately tiny.
 *
 * Rule: this is a financial product handling identity-linked data under PDPL. Log what
 * happened and to which user id — never the payload. No salaries, no OTP codes, no
 * tokens, no email bodies.
 */
type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

// Tests assert on behaviour, not on log lines — and a suite that prints a hundred JSON blobs is a
// suite nobody reads the output of. LOG_LEVEL still overrides, for when a test needs to be noisy.
const defaultLevel: Level = process.env.NODE_ENV === 'test' ? 'silent' : 'info';
const threshold = LEVELS[(process.env.LOG_LEVEL as Level) ?? defaultLevel] ?? LEVELS.info;

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...context,
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};
