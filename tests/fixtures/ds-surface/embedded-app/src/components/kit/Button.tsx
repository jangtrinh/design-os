import React from "react";

export function Button({ label }: { label: string }) {
  return <button className="bg-primary">{label}</button>;
}
