import React from "react";
import { cn } from "../../lib/cn";

interface BadgeProps {
  tone?: "neutral" | "danger";
  text: string;
}

export const Badge = ({ tone = "neutral", text }: BadgeProps) => (
  <span className={cn("rounded px-2 text-primary", tone === "danger" && "text-ink")}>{text}</span>
);
