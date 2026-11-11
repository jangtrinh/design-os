/** How a member is printed for people: `label (id)` when the cluster carries a label, else the id alone. */
import type { Cluster } from "./cluster.js";

export function memberText(cluster: Pick<Cluster, "labels">, member: string): string {
  const label = cluster.labels?.[member];
  return label === undefined || label === "" ? member : member === "" ? label : `${label} (${member})`;
}
