import { describe, expect, it } from "vitest";
import {
  accessRequestProfiles,
  accessRequestStatuses,
  canGrantRole,
  classifyAccountLink,
  compactIdentifier,
  defaultRoleForProfile,
  grantableRolesByProfile,
  isOpenAccessRequest,
  isSafeRecordMatch,
  nextAccessRequestStatus,
} from "@/features/access/institutional-link";
import {
  requesterAccessRequestActionInputSchema,
  reviewAccessRequestInputSchema,
  searchSchoolsForAccessInputSchema,
  submitAccessRequestInputSchema,
} from "@/features/access/request-schemas";

const SCHOOL = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";

describe("classifyAccountLink", () => {
  it("distingue conta com vínculo activo de conta sem vínculo", () => {
    expect(classifyAccountLink([{ isActive: true }])).toBe("linked");
    expect(classifyAccountLink([{ isActive: false }, { isActive: true }])).toBe("linked");
    expect(classifyAccountLink([{ isActive: false }])).toBe("unlinked");
    expect(classifyAccountLink([])).toBe("unlinked");
    expect(classifyAccountLink(null)).toBe("unlinked");
  });
});

describe("máquina de estados do pedido", () => {
  it("só aprova, rejeita ou cancela pedidos em aberto", () => {
    for (const closed of ["approved", "rejected", "cancelled"] as const) {
      expect(nextAccessRequestStatus(closed, "approve")).toBeNull();
      expect(nextAccessRequestStatus(closed, "reject")).toBeNull();
      expect(nextAccessRequestStatus(closed, "cancel")).toBeNull();
      expect(isOpenAccessRequest(closed)).toBe(false);
    }
    for (const open of ["pending", "in_review", "info_requested"] as const) {
      expect(nextAccessRequestStatus(open, "approve")).toBe("approved");
      expect(nextAccessRequestStatus(open, "reject")).toBe("rejected");
      expect(nextAccessRequestStatus(open, "cancel")).toBe("cancelled");
      expect(isOpenAccessRequest(open)).toBe(true);
    }
  });

  it("a resposta do requerente só vale quando foi pedida informação, e devolve à fila", () => {
    expect(nextAccessRequestStatus("info_requested", "reply")).toBe("pending");
    expect(nextAccessRequestStatus("pending", "reply")).toBeNull();
    expect(nextAccessRequestStatus("in_review", "reply")).toBeNull();
  });

  it("marcar em análise só a partir de pendente", () => {
    expect(nextAccessRequestStatus("pending", "start_review")).toBe("in_review");
    expect(nextAccessRequestStatus("info_requested", "start_review")).toBeNull();
  });

  it("cobre os seis estados pedidos", () => {
    expect([...accessRequestStatuses]).toEqual([
      "pending",
      "in_review",
      "info_requested",
      "approved",
      "rejected",
      "cancelled",
    ]);
  });
});

describe("papéis concedidos por aprovação", () => {
  it("nunca concede Administrador por pedido de acesso", () => {
    for (const profile of accessRequestProfiles) {
      expect(grantableRolesByProfile[profile]).not.toContain("Administrador");
      expect(canGrantRole("Administrador", profile, "Administrador").ok).toBe(false);
    }
  });

  it("o papel tem de corresponder ao perfil pedido", () => {
    expect(canGrantRole("Secretaria", "aluno", "Aluno").ok).toBe(true);
    expect(canGrantRole("Secretaria", "aluno", "Professor").ok).toBe(false);
    expect(canGrantRole("Secretaria", "encarregado", "Encarregado").ok).toBe(true);
  });

  it("papéis de pessoal administrativo só por um Administrador", () => {
    expect(canGrantRole("Secretaria", "funcionario", "Tesouraria").ok).toBe(false);
    expect(canGrantRole("Administrador", "funcionario", "Tesouraria").ok).toBe(true);
  });

  it("só Administração e Secretaria decidem", () => {
    expect(canGrantRole("Professor", "aluno", "Aluno").ok).toBe(false);
    expect(canGrantRole("Tesouraria", "aluno", "Aluno").ok).toBe(false);
  });

  it("o papel por omissão é admissível para o perfil", () => {
    for (const profile of accessRequestProfiles) {
      expect(grantableRolesByProfile[profile]).toContain(defaultRoleForProfile(profile));
    }
  });
});

describe("correspondência segura com o cadastro", () => {
  const base = {
    requestedNumber: "2024/0153",
    requestedNationalId: "004212984la042",
    recordNumbers: ["20240153"],
    recordNationalId: "004212984LA042",
  };

  it("exige B.I. e número a coincidir", () => {
    expect(isSafeRecordMatch(base)).toBe(true);
  });

  it("recusa com um só factor", () => {
    expect(isSafeRecordMatch({ ...base, requestedNationalId: "" })).toBe(false);
    expect(isSafeRecordMatch({ ...base, requestedNumber: "" })).toBe(false);
    expect(isSafeRecordMatch({ ...base, recordNationalId: "999999999LA999" })).toBe(false);
    expect(isSafeRecordMatch({ ...base, recordNumbers: ["20240999"] })).toBe(false);
  });

  it("não confunde valores vazios com correspondência", () => {
    expect(
      isSafeRecordMatch({
        requestedNumber: "--",
        requestedNationalId: "..",
        recordNumbers: [""],
        recordNationalId: "",
      }),
    ).toBe(false);
  });

  it("compacta identificadores sem pontuação nem espaços", () => {
    expect(compactIdentifier(" 004 212 984-la.042 ")).toBe("004212984LA042");
    expect(compactIdentifier(null)).toBe("");
  });
});

describe("esquemas de entrada", () => {
  it("aluno e encarregado têm de indicar o número de aluno", () => {
    const base = { schoolId: SCHOOL, fullName: "Ana Maria" };
    expect(submitAccessRequestInputSchema.safeParse({ ...base, profile: "aluno" }).success).toBe(
      false,
    );
    expect(
      submitAccessRequestInputSchema.safeParse({ ...base, profile: "encarregado" }).success,
    ).toBe(false);
    expect(
      submitAccessRequestInputSchema.safeParse({
        ...base,
        profile: "aluno",
        institutionalNumber: "2024/0153",
      }).success,
    ).toBe(true);
    expect(
      submitAccessRequestInputSchema.safeParse({ ...base, profile: "professor" }).success,
    ).toBe(true);
  });

  it("campos opcionais vazios passam a undefined", () => {
    const parsed = submitAccessRequestInputSchema.parse({
      schoolId: SCHOOL,
      fullName: "Ana Maria",
      profile: "professor",
      nationalId: "  ",
      message: "",
    });
    expect(parsed.nationalId).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  it("rejeitar e pedir informação exigem nota; aprovar exige papel", () => {
    expect(
      reviewAccessRequestInputSchema.safeParse({ action: "reject", requestId: REQUEST, note: "" })
        .success,
    ).toBe(false);
    expect(
      reviewAccessRequestInputSchema.safeParse({ action: "request_info", requestId: REQUEST })
        .success,
    ).toBe(false);
    expect(
      reviewAccessRequestInputSchema.safeParse({ action: "approve", requestId: REQUEST }).success,
    ).toBe(false);
    const approve = reviewAccessRequestInputSchema.parse({
      action: "approve",
      requestId: REQUEST,
      role: "Aluno",
    });
    expect(approve.action === "approve" && approve.linkMatchedRecord).toBe(false);
  });

  it("resposta do requerente não pode ser vazia", () => {
    expect(
      requesterAccessRequestActionInputSchema.safeParse({
        action: "reply",
        requestId: REQUEST,
        reply: " ",
      }).success,
    ).toBe(false);
  });

  it("pesquisa de escola exige pelo menos 3 caracteres", () => {
    expect(searchSchoolsForAccessInputSchema.safeParse({ query: "ab" }).success).toBe(false);
    expect(searchSchoolsForAccessInputSchema.safeParse({ query: "Liceu" }).success).toBe(true);
  });
});
