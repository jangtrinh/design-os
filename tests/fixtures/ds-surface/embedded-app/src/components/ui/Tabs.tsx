import React from "react";

const looks = { line: "border-b", pill: "rounded-full" };

export function Tabs({ look, items }: { look: keyof typeof looks; items: string[] }) {
  return (
    <nav className={looks[look]}>
      {items.map((item) => (
        <a key={item}>{item}</a>
      ))}
    </nav>
  );
}
