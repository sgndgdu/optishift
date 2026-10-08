import { describe, it, expect } from "vitest";
import { collectScopedIds } from "../orgScope";

describe("collectScopedIds", () => {
  it("gövdedeki şube ve departman kimliklerini toplar", () => {
    const l = new Set<string>(), d = new Set<string>();
    collectScopedIds({ location_id: "L1", items: [{ department_id: "D1" }], assigned_location_ids: ["L2"],
      branch_department_ids: { L3: "D2" }, name: "x", location_ids: "undefined" }, l, d);
    expect([...l].sort()).toEqual(["L1", "L2", "L3"]);
    expect([...d].sort()).toEqual(["D1", "D2"]);
  });
});
