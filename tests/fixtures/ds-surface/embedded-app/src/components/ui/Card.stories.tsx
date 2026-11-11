import React from "react";
import Card from "./Card";
import { Badge } from "./Badge";

export default { title: "Card" };
export const WithBadge = () => (
  <Card>
    <Badge text="new" />
  </Card>
);
