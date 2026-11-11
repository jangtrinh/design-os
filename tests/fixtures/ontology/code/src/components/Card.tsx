import React from "react";

export default function Card({ children }: { children: React.ReactNode }) {
  return <section className="bg-surface text-ink p-4">{children}</section>;
}
