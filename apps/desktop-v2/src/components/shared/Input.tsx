import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  mono?: boolean;
}

export function Input({ label, mono = false, className = "", id, ...props }: InputProps) {
  const inputClasses = ["input", mono && "input-mono", className].filter(Boolean).join(" ");

  if (!label) {
    return <input id={id} className={inputClasses} {...props} />;
  }

  return (
    <div className="input-group">
      <label className="input-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className={inputClasses} {...props} />
    </div>
  );
}
