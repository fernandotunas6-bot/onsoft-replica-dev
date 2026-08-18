import { describe, expect, it } from "vitest";
import { getFirebaseApp, getCrashlytics, firebaseConfig } from "@/lib/firebase";
import { mapSupabaseClassToGoogleEvent } from "@/lib/google-calendar";
import { buildStudentWelcomeTemplate } from "@/lib/google-gmail";
import { getGoogleOAuthUrl, GOOGLE_OAUTH_SCOPES } from "@/lib/google-oauth";

describe("Lib Services: Firebase, Google Calendar, Google Gmail, Google OAuth", () => {
  it("initializes firebase app and crashlytics from firebase-applet-config.json", () => {
    expect(firebaseConfig.projectId).toBe("gen-lang-client-0509105360");
    const app = getFirebaseApp();
    expect(app).toBeDefined();

    const crashlytics = getCrashlytics();
    expect(crashlytics).toBeDefined();
    expect(typeof crashlytics.recordError).toBe("function");
    expect(typeof crashlytics.setUserId).toBe("function");
  });

  it("maps supabase class data to google calendar event format correctly", () => {
    const event = mapSupabaseClassToGoogleEvent({
      turmaName: "A1",
      disciplineName: "Matemática",
      teacherName: "Prof. Silva",
      teacherEmail: "silva@escola.ao",
      roomName: "Sala 04",
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:30",
      startDate: "2026-09-01",
      endDate: "2026-12-15",
    });

    expect(event.summary).toBe("[SIGA] Matemática - Turma A1");
    expect(event.location).toBe("Sala: Sala 04");
    expect(event.start.dateTime).toContain("2026-09-01T08:00:00");
    expect(event.attendees?.[0]?.email).toBe("silva@escola.ao");
    expect(event.recurrence?.[0]).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
  });

  it("builds welcome email template with credentials and school details", () => {
    const email = buildStudentWelcomeTemplate({
      studentName: "Ana Maria",
      studentEmail: "anamaria@aluno.ao",
      studentNumber: "2026/099",
      schoolName: "Colégio Futuro",
      courseName: "Informática",
      gradeName: "11ª Classe",
      turmaName: "INF-11B",
      temporaryPassword: "TmpPassword!2026",
    });

    expect(email.subject).toContain("Confirmação de Matrícula: Ana Maria");
    expect(email.html).toContain("2026/099");
    expect(email.html).toContain("TmpPassword!2026");
    expect(email.text).toContain("TmpPassword!2026");
  });

  it("generates valid OAuth 2.0 URL with requested scopes", () => {
    const url = getGoogleOAuthUrl({
      redirectUri: "https://siga.escola.ao/configuracoes",
    });

    expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("client_id=");
    expect(GOOGLE_OAUTH_SCOPES).toContain("https://www.googleapis.com/auth/calendar");
    expect(GOOGLE_OAUTH_SCOPES).toContain("https://www.googleapis.com/auth/gmail.send");
  });
});
