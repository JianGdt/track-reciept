export function ownedImagePath(uid: string, path: string) {
  return (
    path.startsWith(`${uid}/`) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i.test(
      path.slice(uid.length + 1),
    )
  );
}
export type ScanQuota = { window_start: number; requests: number };
export function nextScanQuota(
  current: ScanQuota | undefined,
  now: number,
): ScanQuota | null {
  if (!current) return { window_start: now, requests: 1 };
  if (
    !Number.isFinite(current.window_start) ||
    !Number.isInteger(current.requests) ||
    current.requests < 0
  )
    return null;
  if (now - current.window_start >= 3_600_000)
    return { window_start: now, requests: 1 };
  if (current.requests >= 20) return null;
  return { window_start: current.window_start, requests: current.requests + 1 };
}
