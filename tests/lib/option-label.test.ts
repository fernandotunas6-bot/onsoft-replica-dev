import { describe, expect, it } from "vitest";
import { distinctOptionLabels, idOptions, resolveOptionId } from "@/lib/option-label";

const groups = [
  { id: "3f2e79f0-0000-0000-0000-000000000001", name: "A" },
  { id: "9c1d0aa1-0000-0000-0000-000000000002", name: "A" },
  { id: "77aa0000-0000-0000-0000-000000000003", name: "B" },
];

describe("rótulos de opção", () => {
  it("só os nomes repetidos levam o pedaço do id", () => {
    expect(distinctOptionLabels(groups, (g) => g.name)).toEqual([
      "A · 3f2e79f0",
      "A · 9c1d0aa1",
      "B",
    ]);
  });

  it("os rótulos ficam únicos: o id volta pela posição", () => {
    const labels = distinctOptionLabels(groups, (g) => g.name);
    const ids = groups.map((g) => g.id);
    expect(resolveOptionId(labels, "A · 9c1d0aa1", ids)).toBe(groups[1]!.id);
    expect(resolveOptionId(labels, "B", ids)).toBe(groups[2]!.id);
  });

  it("idOptions dá o id como valor", () => {
    expect(idOptions(groups, (g) => g.name)[2]).toEqual({ value: groups[2]!.id, label: "B" });
  });
});
