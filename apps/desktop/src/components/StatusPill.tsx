interface StatusPillProps {
  kind: "ok" | "warn";
  label: string;
}

export function StatusPill({ kind, label }: StatusPillProps) {
  return <span className={`status-pill status-pill-${kind}`}>{label}</span>;
}
