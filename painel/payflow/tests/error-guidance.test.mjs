import assert from "node:assert/strict";
import test from "node:test";

import {
  apiErrorFrom,
  PAYFLOW_GUIDANCE_CODES,
  PayflowApiError,
  payflowGuidance,
} from "../lib/error-guidance.ts";

test("cada código da API tem a correcção para o público certo", () => {
  const admin = payflowGuidance({ code: "bank_transfer_not_configured" }, "admin");
  assert.match(admin.fix, /Definições → Financeiro/);
  const student = payflowGuidance({ code: "bank_transfer_not_configured" }, "student");
  assert.match(student.fix, /outro método|tesouraria/);
  // O aluno nunca recebe caminhos internos do SIGA.
  for (const code of PAYFLOW_GUIDANCE_CODES) {
    const fix = payflowGuidance({ code }, "student")?.fix ?? "";
    assert.doesNotMatch(fix, /Definições|SIGA →|conciliação/i, code);
  }
});

test("a conciliação aponta para Financeiro, onde o botão existe no SIGA", () => {
  assert.match(
    payflowGuidance({ code: "admin_session_required" }, "admin").fix,
    /Financeiro → Conciliação PayFlow/,
  );
});

test("rede e falhas internas oferecem repetir; regras de negócio não", () => {
  assert.equal(payflowGuidance({ message: "Failed to fetch" }, "student").retryable, true);
  assert.equal(payflowGuidance({ code: "network_error" }, "admin").retryable, true);
  assert.equal(payflowGuidance({ code: "payment_refund_failed" }, "admin").retryable, true);
  assert.equal(payflowGuidance({ code: "bank_connector_unavailable" }, "admin").retryable, true);
  assert.equal(payflowGuidance({ code: "transfer_mismatch" }, "admin").retryable, false);
  assert.equal(payflowGuidance({ code: "student_access_limited" }, "student").retryable, false);
});

test("sem regra para o público, não inventa correcção", () => {
  assert.equal(payflowGuidance({ code: "transfer_mismatch" }, "student"), null);
  assert.equal(payflowGuidance({ code: "codigo_desconhecido" }, "admin"), null);
  assert.equal(payflowGuidance(null, "admin"), null);
});

test("apiErrorFrom guarda o código e usa a frase de recurso sem mensagem", () => {
  const error = apiErrorFrom(
    { error: { code: "student_not_verified", message: "PIN inválido." } },
    "x",
  );
  assert.ok(error instanceof PayflowApiError);
  assert.equal(error.code, "student_not_verified");
  assert.equal(error.message, "PIN inválido.");
  const empty = apiErrorFrom({}, "Não foi possível identificar o aluno.");
  assert.equal(empty.code, "unknown");
  assert.equal(empty.message, "Não foi possível identificar o aluno.");
});
