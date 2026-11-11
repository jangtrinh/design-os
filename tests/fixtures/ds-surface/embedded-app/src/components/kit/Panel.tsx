import React from "react";

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
