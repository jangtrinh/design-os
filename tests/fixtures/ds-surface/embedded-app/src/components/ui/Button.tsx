import React from "react";

interface ButtonProps {
  label: string;
  onClick?: () => void;
}

export function Button({ label, onClick }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{ background: "var(--color-primary)", color: "var(--color-surface)", borderColor: "var(--color-missing)" }}
    >
      {label}
    </button>
  );
}
