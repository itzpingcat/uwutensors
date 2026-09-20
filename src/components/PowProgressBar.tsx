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
