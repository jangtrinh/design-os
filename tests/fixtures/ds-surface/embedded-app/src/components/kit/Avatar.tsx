import React from "react";

export function Avatar({ src }: { src: string }) {
  return <img src={src} alt="" className="rounded-full" />;
}
