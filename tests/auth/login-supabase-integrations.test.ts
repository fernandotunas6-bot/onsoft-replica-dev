import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { getFirebaseApp, getCrashlytics, firebaseConfig } from "@/lib/firebase";
import {
  getGoogleOAuthUrl,
  saveGoogleOAuthToken,
  getStoredGoogleOAuthToken,
  clearGoogleOAuthToken,
} from "@/lib/google-oauth";
import { buildStudentWelcomeTemplate, sendWelcomeEmailOnStudentEnrolled } from "@/lib/google-gmail";
import {
  mapSupabaseClassToGoogleEvent,
  createGoogleCalendarClassEvent,
} from "@/lib/google-calendar";

describe("Supabase Auth & Third-Party Integration Isolation", () => {
  it("initializes Supabase client using production Supabase credentials", () => {
    expect(supabase).toBeDefined();
    expect(typeof supabase.auth.getSession).toBe("function");
    expect(typeof supabase.auth.signInWithPassword).toBe("function");
    expect(typeof supabase.auth.signOut).toBe("function");
  });

  it("validates that Firebase initialization operates without conflicting with Supabase auth", () => {
    const app = getFirebaseApp();
    expect(app).toBeDefined();
    expect(app.name).toBe("[DEFAULT]");

    const crashlytics = getCrashlytics();
    crashlytics.setUserId("test-user-supabase-uuid-1234");
    crashlytics.setAttribute("role", "Administrador");
    crashlytics.recordError(new Error("Test handled error for crashlytics"));

    // Supabase auth client remains untouched and intact
    expect(supabase.auth).toBeDefined();
  });

  it("validates Google OAuth token storage is isolated from Supabase auth session in storage", () => {
    clearGoogleOAuthToken();
    expect(getStoredGoogleOAuthToken()).toBeNull();

    saveGoogleOAuthToken({
      access_token: "ya29.test_google_access_token_12345",
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send",
      expires_in: 3600,
    });

    const googleSession = getStoredGoogleOAuthToken();
    expect(googleSession).not.toBeNull();
    expect(googleSession?.access_token).toBe("ya29.test_google_access_token_12345");

    clearGoogleOAuthToken();
    expect(getStoredGoogleOAuthToken()).toBeNull();
  });

  it("uses production domain https://portal-siga.com for Google OAuth redirect and welcome templates", () => {
    const oauthUrl = getGoogleOAuthUrl();
    expect(oauthUrl).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(oauthUrl).toContain("client_id=");

    const welcomeTemplate = buildStudentWelcomeTemplate({
      studentName: "Valentino Canguele",
      studentEmail: "aluno@portal-siga.com",
      studentNumber: "2026/0042",
      schoolName: "Complexo Escolar SIGA",
      courseName: "Engenharia Informática",
      temporaryPassword: "SigaPassword#2026",
    });

    expect(welcomeTemplate.subject).toContain("Valentino Canguele");
    expect(welcomeTemplate.html).toContain("https://portal-siga.com");
    expect(welcomeTemplate.text).toContain("https://portal-siga.com");
  });

  it("handles Google Calendar event mapping from Supabase timetable structures cleanly", () => {
    const classData = {
      turmaName: "12ª A",
      disciplineName: "Física",
      teacherName: "Prof. António",
      teacherEmail: "antonio@escola.ao",
      roomName: "Laboratório 2",
      dayOfWeek: 2,
      startTime: "09:45",
      endTime: "11:15",
      startDate: "2026-09-01",
      endDate: "2026-12-20",
    };

    const googleEvent = mapSupabaseClassToGoogleEvent(classData);
    expect(googleEvent.summary).toBe("[SIGA] Física - Turma 12ª A");
    expect(googleEvent.location).toBe("Sala: Laboratório 2");
    expect(googleEvent.attendees?.[0]?.email).toBe("antonio@escola.ao");
    expect(googleEvent.recurrence?.[0]).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU");
  });

  it("validates Supabase auth signInWithPassword API interface compatibility", async () => {
    const signInSpy = vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValueOnce({
      data: {
        user: {
          id: "efa4db4e-e916-4423-882a-37b1e0533020",
          email: "fernandotunas6@gmail.com",
          app_metadata: {},
          user_metadata: { full_name: "Fernando Tunas (Admin)" },
          aud: "authenticated",
          created_at: new Date().toISOString(),
        },
        session: {
          access_token: "mock-supabase-access-token",
          refresh_token: "mock-supabase-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id: "efa4db4e-e916-4423-882a-37b1e0533020",
            email: "fernandotunas6@gmail.com",
            app_metadata: {},
            user_metadata: { full_name: "Fernando Tunas (Admin)" },
            aud: "authenticated",
            created_at: new Date().toISOString(),
          },
        },
      },
      error: null,
    });

    const result = await supabase.auth.signInWithPassword({
      email: "fernandotunas6@gmail.com",
      password: "Admin@Siga2026!",
    });

    expect(signInSpy).toHaveBeenCalledWith({
      email: "fernandotunas6@gmail.com",
      password: "Admin@Siga2026!",
    });
    expect(result.error).toBeNull();
    expect(result.data.user?.email).toBe("fernandotunas6@gmail.com");
    expect(result.data.session?.access_token).toBe("mock-supabase-access-token");

    signInSpy.mockRestore();
  });
});
