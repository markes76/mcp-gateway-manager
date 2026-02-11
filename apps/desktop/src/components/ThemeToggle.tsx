import { useId } from "react";

import type { ThemeMode } from "@mcp-gateway/domain";

interface ThemeToggleProps {
  isSaving: boolean;
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

const options: ThemeMode[] = ["light", "dark", "system"];

export function ThemeToggle({ isSaving, mode, onChange }: ThemeToggleProps) {
  const id = useId();

  return (
    <fieldset className="theme-toggle" aria-describedby={`${id}-hint`}>
      <legend>Theme</legend>
      <p id={`${id}-hint`} className="theme-toggle-hint">
        Choose appearance. Applies immediately across the shell.
      </p>
      <div className="theme-toggle-grid" role="radiogroup" aria-label="Theme Mode">
        {options.map((option) => (
          <label key={option} className="theme-toggle-option">
            <input
              checked={mode === option}
              disabled={isSaving}
              name={`theme-${id}`}
              onChange={() => onChange(option)}
              type="radio"
              value={option}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
