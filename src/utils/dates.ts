export function formatRelativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  if (!Number.isFinite(diff)) return "Unknown reset time";
  if (diff <= 0) return "Reset due";
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `Reset in ${days}d ${hours}h`;
  if (hours) return `Reset in ${hours}h ${mins}m`;
  return `Reset in ${Math.max(1, mins)}m`;
}
export function formatAge(timestamp: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}
