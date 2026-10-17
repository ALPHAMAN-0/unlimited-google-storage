/**
 * Format a byte count as a human-readable string.
 *
 * 1536 → "1.50 KB"
 * 0    → "0 B"
 * -1   → "0 B"  (negative values are clamped to 0; never display "−1 B")
 */
export function formatBytes(n: bigint | number): string {
  const raw = typeof n === "bigint" ? n : BigInt(Math.floor(n));
  const bytes = raw < 0n ? 0n : raw;
  if (bytes === 0n) return "0 B";

  const KB = 1024n;
  const MB = KB * 1024n;
  const GB = MB * 1024n;
  const TB = GB * 1024n;

  if (bytes < KB) return `${bytes} B`;

  const fmt = (v: number) => v.toFixed(2);

  if (bytes < MB) return `${fmt(Number(bytes) / Number(KB))} KB`;
  if (bytes < GB) return `${fmt(Number(bytes) / Number(MB))} MB`;
  if (bytes < TB) return `${fmt(Number(bytes) / Number(GB))} GB`;
  return `${fmt(Number(bytes) / Number(TB))} TB`;
}
