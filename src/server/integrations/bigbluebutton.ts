/**
 * BigBlueButton server-only API adapter.
 * Import only from trusted server-side handlers. NEVER bundle into browser code.
 * Docs: https://docs.bigbluebutton.org/development/api/
 */
export type BbbConfig = { endpoint: string; secret: string };
export type BbbMeeting = { meetingID: string; name: string; attendeePW?: string; moderatorPW?: string };
export type BbbJoin = { meetingID: string; fullName: string; password: string; userID?: string; redirect?: boolean };

function configFromEnv(): BbbConfig {
  const endpoint = process.env.BBB_API_URL;
  const secret = process.env.BBB_API_SECRET;
  if (!endpoint || !secret) throw new Error("BigBlueButton is not configured");
  return { endpoint, secret };
}

function endpointURL(config: BbbConfig): URL {
  const url = new URL(config.endpoint);
  if (url.protocol !== "https:") throw new Error("BBB_API_URL must use HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("Invalid BBB endpoint");
  if (!url.pathname.endsWith("/api/")) url.pathname = url.pathname.replace(/\/+$/, "") + "/api/";
  return url;
}

async function checksum(method: string, query: string, secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(method + query + secret);
  const digest = await crypto.subtle.digest("SHA-1", bytes); // Required by BBB's legacy API signature protocol.
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function params(input: Record<string, string | boolean | undefined>): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) result.set(key, String(value));
  }
  return result;
}

export async function bbbSignedUrl(
  method: "create" | "join" | "end" | "getMeetingInfo" | "getRecordings",
  input: Record<string, string | boolean | undefined>,
  config: BbbConfig = configFromEnv(),
): Promise<string> {
  const base = endpointURL(config);
  const query = params(input).toString();
  const signature = await checksum(method, query, config.secret);
  const url = new URL(method, base);
  url.search = query + (query ? "&" : "") + "checksum=" + signature;
  return url.toString();
}

async function bbbRequest(method: "create" | "end" | "getMeetingInfo" | "getRecordings", input: Record<string, string | boolean | undefined>): Promise<string> {
  const url = await bbbSignedUrl(method, input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error("BBB service request failed");
    const xml = await response.text();
    if (!/<returncode>SUCCESS<\/returncode>/.test(xml)) throw new Error("BBB rejected request");
    return xml; // Parse XML in a dedicated trusted server handler; do not expose raw responses.
  } finally {
    clearTimeout(timeout);
  }
}

export function scopedMeetingId(schoolId: string, classId: string, sessionId: string): string {
  const ids = [schoolId, classId, sessionId];
  if (ids.some((value) => !/^[a-zA-Z0-9_-]{1,128}$/.test(value))) throw new Error("Invalid meeting scope");
  return ids.map((value) => value.length + "-" + value).join("_");
}

export async function createBbbMeeting(meeting: BbbMeeting): Promise<string> {
  return bbbRequest("create", { meetingID: meeting.meetingID, name: meeting.name, attendeePW: meeting.attendeePW, moderatorPW: meeting.moderatorPW });
}

export async function endBbbMeeting(meetingID: string, moderatorPW: string): Promise<string> {
  return bbbRequest("end", { meetingID, password: moderatorPW });
}

export async function getBbbMeetingInfo(meetingID: string, moderatorPW: string): Promise<string> {
  return bbbRequest("getMeetingInfo", { meetingID, password: moderatorPW });
}

export async function getBbbRecordings(meetingID: string): Promise<string> {
  return bbbRequest("getRecordings", { meetingID });
}

export async function getBbbJoinUrl(input: BbbJoin): Promise<string> {
  return bbbSignedUrl("join", input);
}
