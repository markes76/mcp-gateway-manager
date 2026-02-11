interface BadgeProps {
  count?: number;
  variant?: "default" | "success" | "warning" | "error" | "muted";
  dot?: boolean;
}

export function Badge({ count, variant = "default", dot = false }: BadgeProps) {
  if (dot) {
    return <span className={`badge-dot badge-dot-${variant}`} />;
  }

  if (count === undefined) {
    return null;
  }

  const display = count > 99 ? "99+" : String(count);

  return <span className="badge">{display}</span>;
}
