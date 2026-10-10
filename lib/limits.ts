export const LIMITS = {
  scanPerMinute: 5,
  scanPerDay: 30,
  scanAttemptsPerDay: 60,
  newAccountScanAttemptsPerDay: 20,
  uploadsPerDay: 60,
  newAccountScanPerDay: 10,
  readPerMinute: 120,
  writePerMinute: 30,
  authPerMinute: 10,
  scanIpPerMinute: 20,
  maxReceipts: 2000,
  maxUploadBytes: 4 * 1024 * 1024,
  scanLeaseMs: 120_000,
  globalScansPerDay: 2000,
} as const;

export function utcQuotaWindow(now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const reset = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
  return {
    day,
    reset,
    retryAfter: Math.max(1, Math.ceil((reset - now) / 1000)),
  };
}
