import { describe, expect, it } from "vitest";
import { classroomCourseHref } from "@/features/integrations/actions";
import { getFirebaseApp, defaultFirebaseConfig } from "@/integrations/firebase/firebase";

// O cliente OAuth do Google Workspace (Gmail, Drive, Calendário) saiu a
// 2026-09-28: não era usado por nenhum ecrã e trazia o ID de cliente de outro
// projecto Google. O login com Google passa pelo Supabase Auth e só pede nome,
// e-mail e foto (docs/domains/google-login.md).
describe("Google Classroom e Firebase", () => {
  it("generates correct Google Classroom links for classes", () => {
    expect(classroomCourseHref("TURMA-10A")).toBe("https://classroom.google.com/c/TURMA-10A");
    expect(classroomCourseHref("https://classroom.google.com/c/xyz123")).toBe(
      "https://classroom.google.com/c/xyz123",
    );
    expect(classroomCourseHref("")).toBe("https://classroom.google.com/");
  });

  it("initializes Firebase config matching firebase-applet-config.json", () => {
    expect(defaultFirebaseConfig.projectId).toBe("siga-plus-3ba9c");
    expect(defaultFirebaseConfig.authDomain).toContain("firebaseapp.com");

    const app = getFirebaseApp();
    expect(app).toBeDefined();
    expect(app.name).toBe("[DEFAULT]");
  });
});
