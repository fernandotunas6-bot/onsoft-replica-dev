import { describe, expect, it } from "vitest";
import {
  nextSgaStatus,
  statusToUi,
  uiStatusToSga,
} from "@/features/documents/server";
import { updateDocumentRequestStatusInputSchema } from "@/features/documents/schemas";

/**
 * O pedido de documento tem dois vocabulários de estado: o da base e o da interface. A
 * tradução existia só num sentido, e o avanço de um pedido estava partido em quatro sítios
 * ao mesmo tempo — o rótulo do botão, o zod, o CHECK da base e o gatilho do download.
 *
 * Os defeitos desta classe não se vêem a ler um ficheiro de cada vez: cada metade parece
 * certa sozinha. Só se vêem confrontando as duas com o CHECK real da produção.
 */

/**
 * Lido de `document_requests_status_check` na produção (xodgfmxiaunpamctfeea):
 *
 *   CHECK (status = ANY (ARRAY['submitted','in_review','approved','rejected',
 *                              'fulfilled','cancelled']))
 *
 * Mudar isto exige ir confirmar à base — é esse o ponto.
 */
const ESTADOS_DA_BASE = [
  "submitted",
  "in_review",
  "approved",
  "rejected",
  "fulfilled",
  "cancelled",
];

describe("vocabulário de estados dos pedidos de documento", () => {
  it("tudo o que se grava na base é um estado que o CHECK admite", () => {
    const foraDoCheck = Object.values(uiStatusToSga).filter(
      (estado) => !ESTADOS_DA_BASE.includes(estado),
    );

    expect(
      foraDoCheck,
      "gravar um destes dá 23514 — foi assim que 'ready' e 'delivered' chegaram à base",
    ).toEqual([]);
  });

  it("os dois mapas são inversos um do outro", () => {
    for (const [sga, ui] of Object.entries(statusToUi)) {
      expect(uiStatusToSga[ui], `${sga} → ${ui} não volta a ${sga}`).toBe(sga);
    }
    for (const [ui, sga] of Object.entries(uiStatusToSga)) {
      expect(statusToUi[sga], `${ui} → ${sga} não volta a ${ui}`).toBe(ui);
    }
  });

  it("o zod aceita exactamente os estados que o servidor sabe traduzir", () => {
    const aceites = [...updateDocumentRequestStatusInputSchema.shape.status.options].sort();
    const traduziveis = Object.keys(uiStatusToSga).sort();

    expect(
      aceites,
      "um estado aceite pelo zod e sem tradução rebenta na base; um traduzível e " +
        "recusado pelo zod nunca lá chega",
    ).toEqual(traduziveis);
  });

  it("todo o estado da base tem leitura para a interface", () => {
    const semLeitura = ESTADOS_DA_BASE.filter((estado) => !statusToUi[estado]);

    expect(
      semLeitura,
      "sem entrada em statusToUi, o pedido aparece na lista com o estado errado",
    ).toEqual([]);
  });

  it("o circuito de avanço percorre a base e termina", () => {
    for (const [de, para] of Object.entries(nextSgaStatus)) {
      expect(ESTADOS_DA_BASE, `estado de partida desconhecido: ${de}`).toContain(de);
      if (para !== null) {
        expect(ESTADOS_DA_BASE, `${de} avança para um estado inexistente: ${para}`).toContain(
          para,
        );
      }
    }

    // Do primeiro estado até ao fim, sem ciclos e sem becos.
    const percorridos: string[] = [];
    let actual: string | null = "submitted";
    while (actual) {
      expect(percorridos, `ciclo no avanço de estados em ${actual}`).not.toContain(actual);
      percorridos.push(actual);
      actual = nextSgaStatus[actual] ?? null;
    }

    expect(percorridos).toEqual(["submitted", "in_review", "approved", "fulfilled"]);
  });
});
