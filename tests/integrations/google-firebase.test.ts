import { describe, expect, it } from "vitest";
import {
  buildGoogleAuthUrl,
  GOOGLE_WORKSPACE_SCOPES,
  checkGooglePermissions,
} from "@/integrations/google/oauth";
import { buildStudentWelcomeTemplate } from "@/integrations/google/gmail-service";
import { classroomCourseHref } from "@/features/integrations/actions";
import { getFirebaseApp, defaultFirebaseConfig } from "@/integrations/firebase/firebase";

describe("Google Workspace & Firebase Integrations", () => {
  it("builds the Google OAuth URL with proper scopes", () => {
    const url = buildGoogleAuthUrl({
      clientId: "test-client-id",
      redirectUri: "https://siga.escola.ao/oauth/callback",
    });

    expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fsiga.escola.ao%2Foauth%2Fcallback");
    expect(url).toContain("scope=");
    expect(GOOGLE_WORKSPACE_SCOPES).toContain("https://www.googleapis.com/auth/calendar");
    expect(GOOGLE_WORKSPACE_SCOPES).toContain("https://www.googleapis.com/auth/gmail.send");
  });

  it("builds a rich student welcome email template for Gmail API", () => {
    const template = buildStudentWelcomeTemplate({
      recipientEmail: "aluno@escola.ao",
      studentName: "Manuel António",
      studentNumber: "2026/00142",
      schoolName: "Complexo Escolar SIGA",
      courseName: "Ciências Físicas e Biológicas",
      gradeName: "10ª Classe",
      turmaName: "CFB-10A",
      shift: "Manhã",
      academicYear: "2026/2027",
      schoolPhone: "+244 923 000 000",
    });

    expect(template.subject).toContain("Confirmação de Matrícula: Manuel António");
    expect(template.html).toContain("Manuel António");
    expect(template.html).toContain("2026/00142");
    expect(template.html).toContain("CFB-10A");
    expect(template.text).toContain("2026/00142");
  });

  it("generates correct Google Classroom links for classes", () => {
    expect(classroomCourseHref("TURMA-10A")).toBe("https://classroom.google.com/c/TURMA-10A");
    expect(classroomCourseHref("https://classroom.google.com/c/xyz123")).toBe(
      "https://classroom.google.com/c/xyz123",
    );
    expect(classroomCourseHref("")).toBe("https://classroom.google.com/");
  });

  it("initializes Firebase config matching firebase-applet-config.json", () => {
    expect(defaultFirebaseConfig.projectId).toBe("siga-plus-3ba9c");
    expect(defaultFirebaseConfig.apiKey).toBe("AIzaSyCLOIqKSrOru6yTCf7uK-LI0OWZbG_QZws");
    expect(defaultFirebaseConfig.authDomain).toContain("firebaseapp.com");

    const app = getFirebaseApp();
    expect(app).toBeDefined();
    expect(app.name).toBe("[DEFAULT]");
  });

  it("checks Google permissions default fallback", () => {
    const permissions = checkGooglePermissions();
    expect(typeof permissions.hasCalendar).toBe("boolean");
    expect(typeof permissions.hasGmail).toBe("boolean");
    expect(typeof permissions.isConnected).toBe("boolean");
  });
});
