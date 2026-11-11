import React from "react";
import { Button } from "../components/ui/Button";
import Card from "../components/ui/Card";
import { Panel } from "../components/kit/Panel";

export default function Home() {
  return (
    <Panel title="Home">
      <Card>
        <Button label="Start" />
      </Card>
    </Panel>
  );
}
