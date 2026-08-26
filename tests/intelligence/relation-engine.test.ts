import { describe, expect, it } from "vitest";
import { applyRelationMap } from "@/features/intelligence/relation-engine";
import type { RelationMap } from "@/features/intelligence/types";

type Snapshot = { count: number };

const map: RelationMap<Snapshot> = [
  {
    key: "alpha",
    label: "Alpha",
    module: "pessoas",
    resolve: (snapshot) => ({
      status: snapshot.count > 0 ? "ok" : "empty",
      summary: `${snapshot.count} itens`,
      route: "/alpha",
    }),
  },
  {
    key: "beta",
    label: "Beta",
    module: "financeiro",
    resolve: () => ({ status: "critical", summary: "sempre crítico", route: null }),
  },
];

describe("applyRelationMap", () => {
  it("resolves each relation definition against the snapshot", () => {
    const edges = applyRelationMap(map, { count: 3 });
    expect(edges).toEqual([
      {
        key: "alpha",
        label: "Alpha",
        module: "pessoas",
        status: "ok",
        summary: "3 itens",
        route: "/alpha",
      },
      {
        key: "beta",
        label: "Beta",
        module: "financeiro",
        status: "critical",
        summary: "sempre crítico",
        route: null,
      },
    ]);
  });

  it("reflects empty status when the resolver reports no data", () => {
    const edges = applyRelationMap(map, { count: 0 });
    expect(edges[0]).toMatchObject({ status: "empty" });
  });
});
