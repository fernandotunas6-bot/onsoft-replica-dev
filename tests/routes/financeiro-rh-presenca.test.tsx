// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { getAttendanceAssurancePolicy } from "@/features/hr/attendance-assurance";

/**
 * Testes de montagem e render de `/financeiro/rh/presenca`.
 *
 * Valida a configuração do motor de validação de presença:
 * 1. Transição de loading para carregado com o formulário preenchido pela
 *    política vinda do servidor.
 * 2. Ramo de erro da política — substitui todo o formulário.
 * 3. Edição de um campo numérico e submissão de `saveAttendanceAssurancePolicy`
 *    com o formulário completo (não só o campo alterado).
 * 4. Estado vazio de evidências.
 * 5. Listagem de evidências com uma linha real.
 */

type PolicyForm = Awaited<ReturnType<typeof getAttendanceAssurancePolicy>>;

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const getAttendanceAssurancePolicyMock = vi.fn();
const listAttendanceAssuranceEvidenceMock = vi.fn();
const saveAttendanceAssurancePolicyMock = vi.fn();

vi.mock("@/features/hr/attendance-assurance", () => ({
  getAttendanceAssurancePolicy: () => getAttendanceAssurancePolicyMock(),
  listAttendanceAssuranceEvidence: () => listAttendanceAssuranceEvidenceMock(),
  saveAttendanceAssurancePolicy: (input: unknown) => saveAttendanceAssurancePolicyMock(input),
}));

const samplePolicy: PolicyForm = {
  enabled: true,
  centerLatitude: -8.83,
  centerLongitude: 13.23,
  geofenceRadiusM: 150,
  maxLocationAccuracyM: 50,
  requireLocation: false,
  storeExactLocation: false,
  checkinEarlyMinutes: 15,
  checkinLateMinutes: 10,
  checkoutEarlyMinutes: 10,
  checkoutLateMinutes: 15,
  autoApproveScore: 70,
  reviewScore: 40,
};

const sampleEvidence = {
  id: "ev-1",
  occurrence_id: "occ-1",
  purpose: "check_in" as const,
  captured_at: "2026-09-10T08:00:00Z",
  time_valid: true,
  location_supplied: true,
  location_accuracy_m: 12,
  distance_from_school_m: 30,
  inside_geofence: true,
  device_integrity_provider: "play_integrity",
  device_integrity_valid: true,
  assurance_score: 90,
  decision: "auto_approved",
  reasons: [],
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/financeiro.rh.presenca");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/financeiro/rh/presenca", () => {
  it("mostra loading e depois o formulário preenchido com a política do servidor", async () => {
    getAttendanceAssurancePolicyMock.mockResolvedValue(samplePolicy);
    listAttendanceAssuranceEvidenceMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar política de presença/)).toBeDefined();

    const raioInput = await screen.findByLabelText<HTMLInputElement>(
      "Raio permitido da geofence em metros",
    );
    expect(raioInput.value).toBe("150");
    const autoApproveInput = screen.getByLabelText<HTMLInputElement>(
      "Score mínimo de aprovação automática",
    );
    expect(autoApproveInput.value).toBe("70");
  });

  it("substitui o formulário pelo ramo de erro quando a política falha", async () => {
    getAttendanceAssurancePolicyMock.mockRejectedValue(
      new Error("Sem permissão para configurar validação de presença."),
    );
    listAttendanceAssuranceEvidenceMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(
        screen.getByText("Sem permissão para configurar validação de presença."),
      ).toBeDefined();
    });
    expect(screen.queryByLabelText("Raio permitido da geofence em metros")).toBeNull();
  });

  it("guarda a política completa (não só o campo alterado) ao clicar em 'Guardar política'", async () => {
    getAttendanceAssurancePolicyMock.mockResolvedValue(samplePolicy);
    listAttendanceAssuranceEvidenceMock.mockResolvedValue([]);
    saveAttendanceAssurancePolicyMock.mockResolvedValue({ saved: true });

    const Page = await loadPage();
    renderRoute(Page);

    const raioInput = await screen.findByLabelText("Raio permitido da geofence em metros");
    fireEvent.change(raioInput, { target: { value: "200" } });

    fireEvent.click(screen.getByRole("button", { name: "Guardar política" }));

    await waitFor(() => {
      expect(saveAttendanceAssurancePolicyMock).toHaveBeenCalledWith({
        data: { ...samplePolicy, geofenceRadiusM: 200 },
      });
    });
  });

  it("mostra o estado vazio de evidências com atalho para a presença do professor", async () => {
    getAttendanceAssurancePolicyMock.mockResolvedValue(samplePolicy);
    listAttendanceAssuranceEvidenceMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem evidências registadas")).toBeDefined();
    });
    expect(screen.getByRole("link", { name: "Abrir presença do professor" })).toBeDefined();
  });

  it("lista uma evidência real com a decisão e a distância calculadas", async () => {
    getAttendanceAssurancePolicyMock.mockResolvedValue(samplePolicy);
    listAttendanceAssuranceEvidenceMock.mockResolvedValue([sampleEvidence]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("90/100")).toBeDefined();
    });
    expect(screen.getByText("auto_approved")).toBeDefined();
    expect(screen.getByText("Dentro")).toBeDefined();
    expect(screen.getByText("30 m")).toBeDefined();
    expect(screen.getByText("Entrada")).toBeDefined();
  });
});
