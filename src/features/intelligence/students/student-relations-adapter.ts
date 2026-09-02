import { paymentStatusFromInvoices } from "@/features/finance/schemas";

export interface StudentRelationsSnapshot {
  studentId: string;
  enrollment: {
    id: string | null;
    status: string | null;
    className: string | null;
    gradeName: string | null;
  };
  academic: {
    finalAverage: number | null;
    attendanceRate?: number | null;
    absences?: number | null;
    hasHistory?: boolean;
  };
  finance: {
    hasData: boolean;
    overdueCount: number;
    overallStatus: "settled" | "pending" | "overdue" | null;
  };
  documents: {
    hasData: boolean;
    pendingCount: number;
  };
  guardians: {
    count: number;
    hasPrimary: boolean;
  };
}

interface StudentProfileLike {
  id: string;
  enrollment_id: string | null;
  enrollment_status: string | null;
  class_name: string | null;
  grade_name: string | null;
  final_average: number | null;
  attendance_rate: number | null;
}

interface StudentGuardianLike {
  is_primary: boolean;
}

interface InvoiceLike {
  student_id: string | null;
  status: string;
  due_on: string | null;
}

interface DocumentRequestLike {
  student_id: string;
  status: string;
}

interface AcademicHistoryYearLike {
  academicYearId: string | null;
}

const PENDING_DOCUMENT_STATUSES = new Set(["queued", "processing"]);

export function mapStudentProfileToSnapshot(
  profile: StudentProfileLike,
  guardians: StudentGuardianLike[],
  invoices: InvoiceLike[] | undefined,
  documents: { requests: DocumentRequestLike[] } | undefined,
  history: { years: AcademicHistoryYearLike[] } | undefined,
): StudentRelationsSnapshot {
  const studentInvoices = (invoices ?? []).filter((invoice) => invoice.student_id === profile.id);
  const studentRequests = (documents?.requests ?? []).filter(
    (request) => request.student_id === profile.id,
  );

  return {
    studentId: profile.id,
    enrollment: {
      id: profile.enrollment_id,
      status: profile.enrollment_status,
      className: profile.class_name,
      gradeName: profile.grade_name,
    },
    academic: {
      finalAverage: profile.final_average,
      attendanceRate: profile.attendance_rate,
      hasHistory: (history?.years.length ?? 0) > 0,
    },
    finance: {
      hasData: invoices !== undefined,
      overdueCount: studentInvoices.filter(
        (invoice) => paymentStatusFromInvoices([invoice]) === "overdue",
      ).length,
      overallStatus: paymentStatusFromInvoices(studentInvoices),
    },
    documents: {
      hasData: documents !== undefined,
      pendingCount: studentRequests.filter((request) =>
        PENDING_DOCUMENT_STATUSES.has(request.status),
      ).length,
    },
    guardians: {
      count: guardians.length,
      hasPrimary: guardians.some((guardian) => guardian.is_primary),
    },
  };
}
