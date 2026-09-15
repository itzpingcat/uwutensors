interface Props {
  active: boolean;
  pct: number;
  label: string;
}

export function PowProgressBar({ active, pct, label }: Props) {
  if (!active) return null;
  return (
    <div className="pow-progress show">
      <div className="pow-bar">
        <div className="pow-fill" style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <div className="pow-text">{label}</div>
    </div>
  );
}

export function formatPowLabel(pow: number, hashes: number, elapsedMs: number, durationMs: number): string {
  const secsLeft = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
  const rate = (hashes / Math.max(1, elapsedMs / 1000)).toFixed(0);
  return `best: ${pow} leading-zero bits · ${rate} h/s · ${secsLeft}s left`;
}
