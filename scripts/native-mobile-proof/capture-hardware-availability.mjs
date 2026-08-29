import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { spawnSync } from "node:child_process";

const output = process.argv[2] ?? "showcase/native-mobile-proof-pilot/evidence/hardware-availability.json";
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};

const deviceOutput = run("xcrun", ["devicectl", "list", "devices"]);
const simulatorPayload = JSON.parse(run("xcrun", ["simctl", "list", "devices", "available", "-j"]));
const simulators = Object.values(simulatorPayload.devices)
  .flat()
  .filter((device) => ["iPhone 17 Pro", "iPhone 17e", "iPad mini (A17 Pro)", "iPad Pro 13-inch (M5)"].includes(device.name))
  .map(({ name, udid, state }) => ({ name, udid, state }));
const report = {
  kind: "design-os.native-mobile-hardware-availability",
  version: 1,
  capturedAt: new Date().toISOString(),
  physicalDevices: deviceOutput === "No devices found." ? [] : [{ raw: deviceOutput }],
  physicalDeviceCommandResult: deviceOutput,
  simulatorAnchors: simulators,
  disposition: deviceOutput === "No devices found." ? "PHYSICAL_DEVICE_TIERS_NOT_RUN" : "PHYSICAL_DEVICES_AVAILABLE",
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`WROTE ${relative(process.cwd(), output)} (${report.physicalDevices.length} physical devices)\n`);
