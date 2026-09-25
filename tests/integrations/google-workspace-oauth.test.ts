import { afterAll, describe, expect, it } from "vitest";
import {
  ALL_WORKSPACE_SERVICES, GOOGLE_WORKSPACE_SCOPES, allowedServicesFromScopes,
  buildGoogleWorkspaceAuthorizeUrl, parseGrantedScopes, scopesForServices,
  validateWorkspaceServices,
} from "@/integrations/google/workspace-services";
import {
  randomBase64Url, sha256Base64Url,
  encryptWorkspaceSecret, decryptWorkspaceSecret,
} from "@/integrations/google/workspace-crypto.server";

describe("Google OAuth PKCE: separate from Supabase Auth", () => {
  const urlOptions = {
    clientId: "test-client-id",
    redirectUri: "https://portal-siga.com/api/integrations/google/callback",
    state: "opaque-random-state", codeChallenge: "verifier-sha256",
  };

  it("never requests implicit tokens or the Supabase callback URI", () => {
    const url = new URL(buildGoogleWorkspaceAuthorizeUrl({
      ...urlOptions, services: ["drive", "calendar"],
    }));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe(urlOptions.state);
    expect(url.searchParams.get("redirect_uri")).toBe(urlOptions.redirectUri);
    expect(url.searchParams.get("scope")).toContain("drive.file");
    expect(url.searchParams.get("scope")).not.toContain("gmail.send");
    expect(url.searchParams.get("scope")).not.toContain("https://xodgfmxiaunpamctfeea");
  });

  it("covers all seven separate Google services and deduplicates requested grants", () => {
    expect(ALL_WORKSPACE_SERVICES).toHaveLength(7);
    expect(validateWorkspaceServices(["drive", "drive", "calendar"]))
      .toEqual(["drive", "calendar"]);
    expect(scopesForServices(["docs", "sheets"])).toHaveLength(2);
    expect(allowedServicesFromScopes(scopesForServices(ALL_WORKSPACE_SERVICES)))
      .toHaveLength(7);
  });

  it("requires Classroom course, coursework and roster grants for integrated operations", () => {
    expect(GOOGLE_WORKSPACE_SCOPES.classroom)
      .toContain("https://www.googleapis.com/auth/classroom.courses");
    expect(GOOGLE_WORKSPACE_SCOPES.classroom)
      .toContain("https://www.googleapis.com/auth/classroom.coursework.students");
    expect(GOOGLE_WORKSPACE_SCOPES.classroom)
      .toContain("https://www.googleapis.com/auth/classroom.rosters");
    expect(GOOGLE_WORKSPACE_SCOPES.drive)
      .toEqual(["https://www.googleapis.com/auth/drive.file"]);
    expect(GOOGLE_WORKSPACE_SCOPES.gmail)
      .toEqual(["https://www.googleapis.com/auth/gmail.send"]);
  });

  it("does not grant a service from incomplete or user-supplied scopes", () => {
    const incomplete = scopesForServices(["classroom"]).filter((s) => !s.endsWith(".rosters"));
    expect(allowedServicesFromScopes(incomplete)).not.toContain("classroom");
    expect(allowedServicesFromScopes(scopesForServices(["calendar"])))
      .toEqual(["calendar"]);
    expect(parseGrantedScopes("gmail.send gmail.send calendar.events"))
      .toEqual(["gmail.send", "calendar.events"]);
  });

  it.each([
    [], ["unknown"], ["drive", 3], Array.from({ length: 8 }, () => "gmail"),
  ])("rejects invalid or excessive service selections: %s", (services) => {
    expect(() => validateWorkspaceServices(services)).toThrow();
  });

  it("rejects HTTP callbacks and redirects under external domains", () => {
    expect(() => buildGoogleWorkspaceAuthorizeUrl({
      ...urlOptions, redirectUri: "http://external.example/callback", services: ["drive"],
    })).toThrow("HTTPS");
    expect(() => buildGoogleWorkspaceAuthorizeUrl({
      ...urlOptions, clientId: "", services: ["drive"],
    })).toThrow();
  });

  it("supports local development callbacks without allowing remote plain HTTP", () => {
    expect(buildGoogleWorkspaceAuthorizeUrl({
      ...urlOptions, redirectUri: "http://localhost:3006/api/integrations/google/callback",
      services: ["drive"],
    })).toContain("localhost");
  });

  it("generates 500 unique opaque OAuth transaction states", () => {
    const states = Array.from({ length: 500 }, () => randomBase64Url(32));
    expect(new Set(states).size).toBe(500);
    expect(states.every((s) => s.length >= 40)).toBe(true);
  });

  it("distinguishes state digests so browser state need not be stored raw", async () => {
    expect(await sha256Base64Url("state-1")).not.toBe(await sha256Base64Url("state-2"));
  });
});

describe("Google encrypted server-only credential vault primitives", () => {
  const previous = process.env.GOOGLE_WORKSPACE_ENCRYPTION_KEY;
  afterAll(() => {
    if (previous === undefined) delete process.env.GOOGLE_WORKSPACE_ENCRYPTION_KEY;
    else process.env.GOOGLE_WORKSPACE_ENCRYPTION_KEY = previous;
  });
  it("encrypts and decrypts without leaking the plaintext in the ciphertext", async () => {
    process.env.GOOGLE_WORKSPACE_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64");
    const ciphertext = await encryptWorkspaceSecret("secret-refresh-token");
    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain("secret-refresh-token");
    expect(await decryptWorkspaceSecret(ciphertext)).toBe("secret-refresh-token");
  });
  it("uses a unique AES-GCM nonce on each encryption", async () => {
    process.env.GOOGLE_WORKSPACE_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64");
    const values = await Promise.all(Array.from({ length: 100 },
      () => encryptWorkspaceSecret("same-message")));
    expect(new Set(values).size).toBe(100);
  });
  it("rejects tampered encrypted payloads", async () => {
    process.env.GOOGLE_WORKSPACE_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64");
    const ciphertext = await encryptWorkspaceSecret("secret");
    const parts = ciphertext.split(".");
    const corrupted = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, -2)}AA`;
    await expect(decryptWorkspaceSecret(corrupted)).rejects.toThrow();
  });
  it("fails closed if the server encryption key is not 256 bits", async () => {
    process.env.GOOGLE_WORKSPACE_ENCRYPTION_KEY = Buffer.alloc(8).toString("base64");
    await expect(encryptWorkspaceSecret("secret")).rejects.toThrow("32 bytes");
  });
});
