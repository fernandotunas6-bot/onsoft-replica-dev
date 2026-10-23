import { describe, expect, it } from "vitest";
import {
  isStudentPortalRequest,
  studentPortalFramePath,
} from "@/features/school-website/student-portal-bridge";
import { portalLoginReturn } from "@/features/auth/portal-login-return";
const origin = "https://school.example",
  frame = {} as Window;
const request = {
  type: "siga-student-request",
  version: 1,
  requestId: "12345678-1234-1234-1234-123456789012",
  schoolSlug: "school-a",
  section: "notas",
};
const event = (changes: object = {}) =>
  ({ source: frame, origin, data: request, ...changes }) as MessageEvent;
describe("ligação do portal de estudante", () => {
  it("aceita apenas a janela e origem esperadas, a escola activa e as páginas conhecidas", () => {
    expect(isStudentPortalRequest(event(), frame, origin, "school-a")).toBe(true);
    for (const change of [
      { origin: "https://other.example" },
      { source: {} },
      { data: { ...request, schoolSlug: "school-b" } },
      { data: { ...request, section: "../acessos" } },
      { data: { ...request, action: "export-all" } },
      { data: { ...request, requestId: "" } },
    ])
      expect(isStudentPortalRequest(event(change), frame, origin, "school-a")).toBe(false);
  });
  it("resolve o website no domínio próprio ou no caminho partilhado sem mudar de origem", () => {
    expect(studentPortalFramePath(origin, "school-a", "https://central.example")).toBe(
      "/site/portal/?connected=1",
    );
    expect(
      studentPortalFramePath("https://central.example", "school-a", "https://central.example"),
    ).toBe("/escolas/school-a/portal/?connected=1");
    expect(studentPortalFramePath(origin, "../school-b", "https://central.example")).toBeNull();
  });
  it("regressa do Google ao portal escolhido sem copiar parâmetros de redireccionamento", () => {
    expect(
      portalLoginReturn(
        origin + "/portal?escola=school-a&vista=estudante&next=https://evil.example#token=x",
      ),
    ).toBe(origin + "/portal?escola=school-a&vista=estudante");
    expect(portalLoginReturn(origin + "/portal?escola=school-a")).toBe(
      origin + "/portal?escola=school-a",
    );
    expect(portalLoginReturn(origin + "/financeiro?return_to=evil")).toBeNull();
  });
});
