import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canPlace,
  freeSeats,
  isClassFullError,
  queuePositions,
} from "@/features/enrollment/waitlist-rules";

describe("lista de espera por turma", () => {
  it("reconhece a recusa de turma cheia de enroll_student", () => {
    expect(isClassFullError({ code: "23514", message: "x" })).toBe(true);
    expect(isClassFullError({ message: "A turma atingiu a capacidade configurada." })).toBe(true);
    expect(isClassFullError({ code: "42501", message: "Sem autorização" })).toBe(false);
    expect(isClassFullError(null)).toBe(false);
  });

  it("vagas = capacidade − ocupados, nunca negativo", () => {
    expect(freeSeats(30, 28)).toBe(2);
    expect(freeSeats(30, 31)).toBe(0);
    expect(freeSeats(null, 0)).toBe(0);
  });

  it("posição por turma, por ordem de chegada", () => {
    const positions = queuePositions([
      { id: "b", classGroupId: "T1", studentId: "s2", createdAt: "2026-10-05T10:00:00Z" },
      { id: "a", classGroupId: "T1", studentId: "s1", createdAt: "2026-10-05T09:00:00Z" },
      { id: "c", classGroupId: "T2", studentId: "s3", createdAt: "2026-10-05T11:00:00Z" },
    ]);
    expect(positions.get("a")).toBe(1);
    expect(positions.get("b")).toBe(2);
    expect(positions.get("c")).toBe(1);
  });

  it("só entra quem está dentro do número de vagas", () => {
    expect(canPlace(1, 1)).toBe(true);
    expect(canPlace(2, 1)).toBe(false);
    expect(canPlace(1, 0)).toBe(false);
    expect(canPlace(2, 2)).toBe(true);
  });

  it("a tabela é só do servidor", () => {
    const sql = readFileSync("supabase/migrations/20261005170000_class_group_waitlist.sql", "utf8");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toMatch(
      /REVOKE ALL ON public\.class_group_waitlist FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).not.toMatch(/CREATE POLICY/);
  });
});
