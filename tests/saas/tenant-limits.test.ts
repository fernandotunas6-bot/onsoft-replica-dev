import { describe, expect, it } from "vitest";
import {
  assertStudentCapacity,
  buildStudentCapacity,
  resolveMaxStudents,
} from "@/features/saas/tenant-limits";
import type { Plan, Tenant } from "@/features/saas/types";

const basePlan: Plan = {
  id: "p1",
  name: "Start",
  code: "start",
  description: "",
  max_students: 100,
  max_staff: 10,
  max_storage_gb: 5,
  price_aoa_monthly: 0,
  price_aoa_yearly: 0,
  features: { academic: true },
  is_active: true,
};

const baseTenant: Tenant = {
  id: "t1",
  name: "Escola Demo",
  slug: "demo",
  status: "active",
  contact_email: "demo@escola.ao",
  max_students: 50,
};

describe("resolveMaxStudents", () => {
  it("prefers tenant override over plan", () => {
    expect(resolveMaxStudents(baseTenant, basePlan)).toBe(50);
  });

  it("falls back to plan when tenant has no limit", () => {
    expect(resolveMaxStudents({ ...baseTenant, max_students: undefined }, basePlan)).toBe(100);
  });

  it("returns null when no limit is configured", () => {
    expect(resolveMaxStudents({ ...baseTenant, max_students: undefined }, null)).toBeNull();
  });
});

describe("buildStudentCapacity", () => {
  it("marks atLimit when active equals max", () => {
    const snapshot = buildStudentCapacity(50, baseTenant, basePlan);
    expect(snapshot).toMatchObject({
      activeStudents: 50,
      maxStudents: 50,
      remaining: 0,
      atLimit: true,
      nearLimit: false,
    });
  });

  it("marks nearLimit above 90% threshold", () => {
    const snapshot = buildStudentCapacity(46, baseTenant, basePlan);
    expect(snapshot.atLimit).toBe(false);
    expect(snapshot.nearLimit).toBe(true);
    expect(snapshot.remaining).toBe(4);
  });

  it("ignores limits when max is unset", () => {
    const snapshot = buildStudentCapacity(999, { ...baseTenant, max_students: undefined }, null);
    expect(snapshot.maxStudents).toBeNull();
    expect(snapshot.atLimit).toBe(false);
    expect(snapshot.nearLimit).toBe(false);
  });
});

describe("assertStudentCapacity", () => {
  it("throws when adding would exceed the plan cap", () => {
    const snapshot = buildStudentCapacity(50, baseTenant, basePlan);
    expect(() => assertStudentCapacity(snapshot, 1)).toThrow(/Limite de alunos/);
  });

  it("allows enrollment when capacity remains", () => {
    const snapshot = buildStudentCapacity(10, baseTenant, basePlan);
    expect(() => assertStudentCapacity(snapshot, 1)).not.toThrow();
  });
});
