import { describe, expect, it } from "vitest";
import { isMissingTable } from "@/integrations/supabase/server-error";

describe("isMissingTable", () => {
  it("reconhece a tabela em falta", () => {
    expect(isMissingTable({ code: "42P01" })).toBe(true);
    expect(isMissingTable({ code: "PGRST205" })).toBe(true);
    expect(isMissingTable({ message: 'relation "public.x" does not exist' })).toBe(true);
  });

  it("não confunde coluna ou função em falta com tabela em falta", () => {
    expect(isMissingTable({ code: "42703", message: 'column "x" does not exist' })).toBe(false);
    expect(isMissingTable({ code: "42883", message: "function f() does not exist" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});
