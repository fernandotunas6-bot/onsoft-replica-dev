import { describe, expect, it } from "vitest";
import {
  OFFICIAL_COMMUNICATION_TEMPLATES,
  getOfficialTemplate,
  listOfficialTemplates,
} from "@/features/communications/templates";

describe("Communication Templates", () => {
  it("carrega todos os templates oficiais previstos", () => {
    const list = listOfficialTemplates();
    expect(list.length).toBeGreaterThanOrEqual(9);

    const expectedSlugs = [
      "ACCOUNT_WELCOME",
      "EMAIL_VERIFICATION",
      "PASSWORD_RESET",
      "STUDENT_ENROLLED",
      "PAYMENT_RECEIPT",
      "PAYMENT_OVERDUE",
      "GRADE_PUBLISHED",
      "ABSENCE_ALERT",
      "SCHOOL_ANNOUNCEMENT",
    ];

    for (const slug of expectedSlugs) {
      const t = getOfficialTemplate(slug);
      expect(t).toBeDefined();
      expect(t?.slug).toBe(slug);
      expect(t?.variables.length).toBeGreaterThan(0);
    }
  });

  it("interpola variáveis corretamente no render", () => {
    const template = OFFICIAL_COMMUNICATION_TEMPLATES.PAYMENT_RECEIPT;
    const rendered = template.render({
      PAYER_NAME: "António Manuel",
      STUDENT_NAME: "Kieza Manuel",
      AMOUNT: "45.000,00",
      RECEIPT_NUMBER: "REC/2026/089",
      MONTH_LABEL: "Março 2026",
      SCHOOL_NAME: "Colégio Esperança",
    });

    expect(rendered.subject).toContain("45.000,00 AOA");
    expect(rendered.subject).toContain("REC/2026/089");
    expect(rendered.text).toContain("António Manuel");
    expect(rendered.text).toContain("Kieza Manuel");
    expect(rendered.html).toContain("45.000,00 AOA");
  });

  it("renderiza código OTP e minutos no template de verificação", () => {
    const template = OFFICIAL_COMMUNICATION_TEMPLATES.EMAIL_VERIFICATION;
    const rendered = template.render({
      FIRST_NAME: "Maria",
      SCHOOL_NAME: "Complexo Girassol",
      OTP_CODE: "739201",
      EXPIRY_MINUTES: "5",
    });

    expect(rendered.subject).toContain("739201");
    expect(rendered.text).toContain("739201");
    expect(rendered.text).toContain("5 minutos");
    expect(rendered.html).toContain("739201");
  });
});
