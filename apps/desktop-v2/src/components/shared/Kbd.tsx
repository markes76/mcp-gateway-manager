interface KbdProps {
  shortcut: string;
}

export function Kbd({ shortcut }: KbdProps) {
  const parts = shortcut.split("+").map((s) => s.trim());

  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {parts.map((key, i) => (
        <kbd key={i} className="kbd">
          {key}
        </kbd>
      ))}
    </span>
  );
}
