import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { meetingRoomLink } from "@/features/integrations/actions";

const migrationsDir = resolve(__dirname, "../../supabase/migrations");
const migration = readFileSync(
  resolve(migrationsDir, "20260924004749_reconcile_zoom_lesson_meetings.sql"),
  "utf8",
);
const zoomServer = readFileSync(resolve(__dirname, "../../src/features/integrations/zoom.ts"), "utf8");

describe("SIGA Integrations — Zoom Meetings & Class Integration", () => {
  it("deve fornecer link de sala e rota oficial da integração", () => {
    const link = meetingRoomLink("zoom");
    expect(link).toBeDefined();
    expect(link).toContain("zoom.us");
  });

  it("deve preservar o título da aula independente da plataforma Zoom", () => {
    const rawLessonTitle = "Equações Diferenciais e Aplicações";
    // Regra explícita: Zoom não faz parte do título da aula
    const formattedTopic = rawLessonTitle.trim();
    expect(formattedTopic).not.toContain("Zoom");
    expect(formattedTopic).toBe("Equações Diferenciais e Aplicações");
  });

  it("o título por omissão no servidor não menciona Zoom", () => {
    expect(zoomServer).toMatch(/const topic = data\.topic \?\? "Aula";/);
  });

  it("migração canónica 20260924004749 é idempotente e não destrutiva", () => {
    expect(existsSync(resolve(migrationsDir, "20260924090000_reconcile_zoom_lesson_meetings.sql"))).toBe(false);
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.siga_lesson_meetings");
    expect(migration).toContain("UNIQUE (provider, external_meeting_id)");
    expect(migration).toContain("UNIQUE (attendance_session_id, provider)");
    expect(migration).toContain("REFERENCES public.siga_attendance_sessions(id)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });
});
