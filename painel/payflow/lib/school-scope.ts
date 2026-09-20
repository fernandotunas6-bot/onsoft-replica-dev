export function schoolScopeForVerification(input: {
  adminSchoolId?: string | null;
  requestedSchoolId?: string | null;
}): { ok: true; schoolId: string } | { ok: false; status: number; code: string; message: string } {
  const schoolId = input.adminSchoolId?.trim() || input.requestedSchoolId?.trim() || "";
  if (!schoolId) {
    return {
      ok: false,
      status: 400,
      code: "school_required",
      message: "Indique a escola da sessão ou school_id no pedido de integração.",
    };
  }
  if (input.adminSchoolId && input.requestedSchoolId && input.adminSchoolId !== input.requestedSchoolId) {
    return {
      ok: false,
      status: 403,
      code: "transfer_school_mismatch",
      message: "A escola do pedido não coincide com a sessão administrativa.",
    };
  }
  return { ok: true, schoolId };
}
