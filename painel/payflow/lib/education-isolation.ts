export function foreignSchoolRecord(
  existingSchoolId: string | null | undefined,
  incomingSchoolId: string,
) {
  return Boolean(existingSchoolId && existingSchoolId !== incomingSchoolId);
}

export function foreignStudentRecord(
  existingStudentId: string | null | undefined,
  incomingStudentId: string,
) {
  return Boolean(existingStudentId && existingStudentId !== incomingStudentId);
}

export function schoolScopeForVerification(input: {
  adminSession?: { schoolId?: string } | null;
  adminSchoolId?: string | null;
  integrationAuthorized?: boolean;
  requestedSchoolId?: string | null;
}): { ok: true; schoolId: string } | { ok: false; status: number; code: string; message: string } {
  const adminSchoolId = input.adminSchoolId ?? input.adminSession?.schoolId;
  const schoolId = adminSchoolId ?? input.requestedSchoolId?.trim() ?? "";
  if (!schoolId) {
    return {
      ok: false,
      status: 400,
      code: "school_required",
      message: "Indique a escola da sessão ou school_id no pedido de integração.",
    };
  }
  if (adminSchoolId && input.requestedSchoolId && adminSchoolId !== input.requestedSchoolId) {
    return {
      ok: false,
      status: 403,
      code: "transfer_school_mismatch",
      message: "A escola do pedido não coincide com a sessão administrativa.",
    };
  }
  return { ok: true, schoolId };
}
