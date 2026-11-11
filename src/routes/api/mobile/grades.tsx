import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { upsertTermGradesBatch } from "@/features/academic/server";
import { mobileRespond, readMobileJson } from "@/features/mobile/api-response";
import { BODY_LIMITS } from "@/lib/read-json-body";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).

/**
 * Lançamento de notas (MAC/NPP/NPT de um trimestre) pela app móvel. Chama a
 * mesma função do SIGA (upsertTermGradesBatch): sessão e MFA, papel e módulo,
 * escola bloqueada, trimestre aberto, escala do modelo, disciplina atribuída à
 * turma, matrícula activa e pauta não oficial. Na base, os triggers de
 * 20260903025000 garantem que um professor só grava na sua turma e disciplina.
 *
 *   POST { subject_id, term: 1..3, rows: [{ enrollment_id, mac, npp, npt }] }
 *
 * A app só envia os alunos que alterou, com as três notas.
 */
export const Route = createFileRoute("/api/mobile/grades")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request),
      POST: async ({ request }) =>
        mobileRespond(request, "api/mobile/grades", async () => {
          const body = (await readMobileJson(
            request,
            BODY_LIMITS.standard,
          )) as MobileGradesBody | null;
          if (!body || typeof body !== "object" || !Array.isArray(body.rows)) {
            throw new ZodError([]);
          }
          return upsertTermGradesBatch({
            data: {
              subjectId: body.subject_id,
              term: body.term,
              rows: body.rows.map((r) => ({
                enrollmentId: r?.enrollment_id,
                mac: r?.mac,
                npp: r?.npp,
                npt: r?.npt,
              })),
            },
          } as never);
        }),
    },
  },
});

type MobileGradesBody = {
  subject_id?: unknown;
  term?: unknown;
  rows?: Array<{ enrollment_id?: unknown; mac?: unknown; npp?: unknown; npt?: unknown } | null>;
};
