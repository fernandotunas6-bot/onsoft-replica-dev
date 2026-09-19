import { describe, expect, it } from "vitest";
import {
  deriveAcademicStatus,
  deriveFinancialSnapshot,
  matchesQuickCategory,
  computeDynamicCounters,
  ACADEMIC_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  formatKz,
} from "@/features/students/academic-status";

describe("academic-status domain engine", () => {
  describe("deriveAcademicStatus", () => {
    it("classifies student with active enrollment as active even if status was applicant", () => {
      const status = deriveAcademicStatus({
        studentStatus: "applicant",
        enrollmentStatus: "active",
        hasClassGroup: true,
      });
      expect(status).toBe("active");
    });

    it("classifies student without class and without active enrollment as applicant", () => {
      const status = deriveAcademicStatus({
        studentStatus: "applicant",
        enrollmentStatus: null,
        hasClassGroup: false,
      });
      expect(status).toBe("applicant");
    });

    it("respects terminal state transferred", () => {
      const status = deriveAcademicStatus({
        studentStatus: "transferred",
        enrollmentStatus: "active",
        hasClassGroup: true,
      });
      expect(status).toBe("transferred");
    });

    it("respects terminal state graduated", () => {
      const status = deriveAcademicStatus({
        studentStatus: "graduated",
        enrollmentStatus: "completed",
        hasClassGroup: true,
      });
      expect(status).toBe("graduated");
    });

    it("respects terminal state inactive / withdrawn", () => {
      const status = deriveAcademicStatus({
        studentStatus: "inactive",
        enrollmentStatus: null,
      });
      expect(status).toBe("inactive");
    });

    it("respects cancelled / void enrollment", () => {
      const status = deriveAcademicStatus({
        studentStatus: "active",
        enrollmentStatus: "cancelled",
      });
      expect(status).toBe("cancelled");
    });

    it("classifies active student with class and pending enrollment as active in progress", () => {
      const status = deriveAcademicStatus({
        studentStatus: "active",
        enrollmentStatus: "pending",
        hasClassGroup: true,
      });
      expect(status).toBe("active");
    });
  });

  describe("deriveFinancialSnapshot", () => {
    const today = "2026-09-03";

    it("returns null paymentStatus when student has zero invoices", () => {
      const snapshot = deriveFinancialSnapshot([], today);
      expect(snapshot.paymentStatus).toBeNull();
      expect(snapshot.hasDebt).toBe(false);
      expect(snapshot.debtAmount).toBe(0);
      expect(snapshot.overdueCount).toBe(0);
    });

    it("detects overdue debt when due_date is before today and unpaid", () => {
      const invoices = [
        {
          id: "inv-1",
          total_amount: 45000,
          amount_paid: 0,
          due_date: "2026-08-10",
          status: "issued",
        },
      ];
      const snapshot = deriveFinancialSnapshot(invoices, today);
      expect(snapshot.hasDebt).toBe(true);
      expect(snapshot.paymentStatus).toBe("overdue");
      expect(snapshot.debtAmount).toBe(45000);
      expect(snapshot.overdueCount).toBe(1);
      expect(snapshot.remainingBalance).toBe(45000);
    });

    it("marks as settled when all invoices are fully paid", () => {
      const invoices = [
        {
          id: "inv-1",
          total_amount: 45000,
          amount_paid: 45000,
          due_date: "2026-08-10",
          status: "paid",
        },
        {
          id: "inv-2",
          total_amount: 50000,
          amount_paid: 50000,
          due_date: "2026-09-10",
          status: "paid",
        },
      ];
      const snapshot = deriveFinancialSnapshot(invoices, today);
      expect(snapshot.hasDebt).toBe(false);
      expect(snapshot.paymentStatus).toBe("settled");
      expect(snapshot.debtAmount).toBe(0);
      expect(snapshot.remainingBalance).toBe(0);
      expect(snapshot.totalPaid).toBe(95000);
    });

    it("marks as pending when invoice is due in the future", () => {
      const invoices = [
        {
          id: "inv-future",
          total_amount: 45000,
          amount_paid: 0,
          due_date: "2026-09-30",
          status: "issued",
        },
      ];
      const snapshot = deriveFinancialSnapshot(invoices, today);
      expect(snapshot.hasDebt).toBe(false);
      expect(snapshot.paymentStatus).toBe("pending");
      expect(snapshot.debtAmount).toBe(0);
      expect(snapshot.remainingBalance).toBe(45000);
    });

    it("calculates partial payment on overdue invoices correctly", () => {
      const invoices = [
        {
          id: "inv-part",
          total_amount: 50000,
          amount_paid: 20000,
          due_date: "2026-08-01",
          status: "partial",
        },
      ];
      const snapshot = deriveFinancialSnapshot(invoices, today);
      expect(snapshot.hasDebt).toBe(true);
      expect(snapshot.paymentStatus).toBe("overdue");
      expect(snapshot.debtAmount).toBe(30000); // 50000 - 20000
      expect(snapshot.remainingBalance).toBe(30000);
      expect(snapshot.totalPaid).toBe(20000);
    });

    it("ignores cancelled and void invoices", () => {
      const invoices = [
        {
          id: "inv-cancelled",
          total_amount: 100000,
          amount_paid: 0,
          due_date: "2026-01-01",
          status: "cancelled",
        },
      ];
      const snapshot = deriveFinancialSnapshot(invoices, today);
      expect(snapshot.hasDebt).toBe(false);
      expect(snapshot.totalBilled).toBe(0);
    });
  });

  describe("matchesQuickCategory & non-mutually exclusive logic", () => {
    const activeStudentWithDebt = {
      student_status: "active",
      payment_status: "overdue",
      has_debt: true,
      class_name: "10ª A",
    };

    it("an active student with debt matches BOTH 'activos' and 'divida'", () => {
      expect(matchesQuickCategory(activeStudentWithDebt, "activos")).toBe(true);
      expect(matchesQuickCategory(activeStudentWithDebt, "divida")).toBe(true);
      expect(matchesQuickCategory(activeStudentWithDebt, "todos")).toBe(true);
      expect(matchesQuickCategory(activeStudentWithDebt, "inactivos")).toBe(false);
      expect(matchesQuickCategory(activeStudentWithDebt, "candidatos")).toBe(false);
    });

    it("an inactive student matches inactivos and its sub-filter", () => {
      const transferredStudent = {
        student_status: "transferred",
        payment_status: "settled",
        has_debt: false,
      };
      expect(matchesQuickCategory(transferredStudent, "inactivos")).toBe(true);
      expect(matchesQuickCategory(transferredStudent, "inactivos", "transferred")).toBe(true);
      expect(matchesQuickCategory(transferredStudent, "inactivos", "graduated")).toBe(false);
    });

    it("candidate matches candidatos and sub-filter waiting_class", () => {
      const candidateWithoutClass = {
        student_status: "applicant",
        payment_status: null,
        class_name: null,
      };
      expect(matchesQuickCategory(candidateWithoutClass, "candidatos")).toBe(true);
      expect(
        matchesQuickCategory(candidateWithoutClass, "candidatos", undefined, "waiting_class"),
      ).toBe(true);
    });
  });

  describe("computeDynamicCounters", () => {
    it("calculates real dynamic counters across all dimensions", () => {
      const sample = [
        { student_status: "active", payment_status: "settled", has_debt: false },
        { student_status: "active", payment_status: "overdue", has_debt: true },
        { student_status: "active", payment_status: "pending", has_debt: false },
        { student_status: "applicant", payment_status: null, has_debt: false },
        { student_status: "transferred", payment_status: "settled", has_debt: false },
        { student_status: "inactive", payment_status: "overdue", has_debt: true },
        { student_status: "graduated", payment_status: "settled", has_debt: false },
      ];

      const counters = computeDynamicCounters(sample, 3); // 3 candidaturas pendentes do portal
      expect(counters.all).toBe(10); // 7 alunos + 3 candidaturas
      expect(counters.active).toBe(3);
      expect(counters.applicant).toBe(4); // 1 aluno applicant + 3 candidaturas
      expect(counters.overdue).toBe(2); // 1 active + 1 inactive com dívida
      expect(counters.other).toBe(3); // transferred, inactive, graduated
      expect(counters.inactivesDetail.transferred).toBe(1);
      expect(counters.inactivesDetail.inactive).toBe(1);
      expect(counters.inactivesDetail.graduated).toBe(1);
    });
  });

  describe("formatKz & labels", () => {
    it("formats amounts in Kwanza standard", () => {
      expect(formatKz(45000)).toContain("45");
      expect(formatKz(45000)).toContain("Kz");
    });

    it("provides human-readable labels for all academic and financial states", () => {
      expect(ACADEMIC_STATUS_LABELS.active).toBe("Activo");
      expect(ACADEMIC_STATUS_LABELS.applicant).toBe("Candidato");
      expect(ACADEMIC_STATUS_LABELS.transferred).toBe("Transferido");
      expect(ACADEMIC_STATUS_LABELS.inactive).toBe("Desistente");
      expect(FINANCIAL_STATUS_LABELS.overdue).toBe("Com dívida");
      expect(FINANCIAL_STATUS_LABELS.settled).toBe("Regularizado");
    });
  });
});
