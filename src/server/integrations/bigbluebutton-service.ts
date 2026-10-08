import {
  createBbbMeeting,
  endBbbMeeting,
  getBbbJoinUrl,
  getBbbRecordings,
  scopedMeetingId,
} from "./bigbluebutton";
import {
  assertVirtualClassroomAccess,
  type ClassroomAuthorization,
} from "./bigbluebutton-policy";

/**
 * Trusted server-side orchestration. Callers MUST fetch the authorization
 * context from the authenticated database session immediately before use.
 * Never accept ClassroomAuthorization as a client-controlled JSON payload.
 * This service is not a public API endpoint and must never be called from the browser.
 */
export type VerifiedClassroomRequest = {
  context: ClassroomAuthorization;
  classGroupId: string;
  sessionId: string;
  title: string;
  fullName: string;
};

function requireServer() {
  if (typeof window !== "undefined") throw new Error("Server-only classroom operation");
}

function meetingId(request: VerifiedClassroomRequest) {
  return scopedMeetingId(request.context.activeSchoolId, request.classGroupId, request.sessionId);
}

function meetingPasswords() {
  const attendeePW = process.env.BBB_ATTENDEE_PASSWORD;
  const moderatorPW = process.env.BBB_MODERATOR_PASSWORD;
  if (!attendeePW || !moderatorPW || attendeePW === moderatorPW) {
    throw new Error("BigBlueButton meeting passwords not configured");
  }
  return { attendeePW, moderatorPW };
}

export async function provisionVirtualClassroom(request: VerifiedClassroomRequest) {
  requireServer();
  assertVirtualClassroomAccess("create", request.context);
  if (request.context.session.id !== request.sessionId)
    throw new Error("Session mismatch");
  const { attendeePW, moderatorPW } = meetingPasswords();
  await createBbbMeeting({
    meetingID: meetingId(request),
    name: request.title,
    attendeePW,
    moderatorPW,
  });
  return { meetingId: meetingId(request) };
}

export async function joinVirtualClassroom(
  request: VerifiedClassroomRequest,
  role: "moderator" | "attendee",
) {
  requireServer();
  assertVirtualClassroomAccess("join", request.context);
  if (request.context.session.id !== request.sessionId) throw new Error("Session mismatch");
  if (role === "moderator") {
    // A student cannot request a moderator link.
    const c = request.context;
    if (c.membership?.role === "student") throw new Error("Moderator access denied");
    const isAdmin =
      c.membership?.role === "school_admin" ||
      c.membership?.role === "pedagogical_admin";
    const assigned =
      c.membership?.role === "teacher" &&
      c.session.teacherId === c.authenticatedUserId &&
      c.teacherAssignment?.active === true &&
      c.teacherAssignment.teacherUserId === c.authenticatedUserId &&
      c.teacherAssignment.schoolId === c.activeSchoolId;
    if (!isAdmin && !assigned) throw new Error("Moderator access denied");
  }
  const passwords = meetingPasswords();
  return getBbbJoinUrl({
    meetingID: meetingId(request),
    fullName: request.fullName,
    password: role === "moderator" ? passwords.moderatorPW : passwords.attendeePW,
    userID: request.context.authenticatedUserId,
    redirect: true,
  });
}

export async function finishVirtualClassroom(request: VerifiedClassroomRequest) {
  requireServer();
  assertVirtualClassroomAccess("end", request.context);
  if (request.context.session.id !== request.sessionId) throw new Error("Session mismatch");
  return endBbbMeeting(meetingId(request), meetingPasswords().moderatorPW);
}

export async function listVirtualClassroomRecordings(request: VerifiedClassroomRequest) {
  requireServer();
  assertVirtualClassroomAccess("recordings", request.context);
  if (request.context.session.id !== request.sessionId) throw new Error("Session mismatch");
  return getBbbRecordings(meetingId(request));
}
