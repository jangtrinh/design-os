import React from "react";

export function Button({ label }: { label: string }) {
  return <button style={{ color: "var(--color-primary)", background: "var(--color-surface)" }}>{label}</button>;
}
