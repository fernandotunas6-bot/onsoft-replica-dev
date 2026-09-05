import assert from "node:assert/strict";
import test from "node:test";

import {
  matchStatementMovements,
  parseAmountToMinor,
  parseBankStatementCsv,
  parseMinorUnits,
} from "../lib/bank-statement.ts";

test("parses Angolan CSV amounts as major units unless valor_centimos is used", () => {
  assert.equal(parseAmountToMinor("15.000,00"), 1_500_000);
  assert.equal(parseAmountToMinor("15000,50"), 1_500_050);
  assert.equal(parseAmountToMinor("15000"), 1_500_000);
  assert.equal(parseMinorUnits("1500000"), 1_500_000);
});

test("extracts PayFlow references from statement description and skips mismatches", () => {
  const csv = [
    "data;referencia;valor;moeda;movimento;descricao",
    "05/09/2026;PF-TF-20260905-ABC123DEAD;15.000,00;AOA;MOV-9981;Propina Setembro",
    "05/09/2026;PF-TF-20260905-ABC123DEAD;10.000,00;AOA;MOV-9982;Valor diferente",
    "05/09/2026;OUTRA-REF;5.000,00;AOA;MOV-9983;Sem referência PayFlow",
    "05/09/2026;PF-TF-20260905-FFFF000011;8.000,00;AOA;MOV-9981;Mesmo movimento",
  ].join("\n");

  const movements = parseBankStatementCsv(csv);
  assert.equal(movements[0].transferReference, "PF-TF-20260905-ABC123DEAD");
  assert.equal(movements[0].amountMinor, 1_500_000);
  assert.equal(movements[2].parseErrors.includes("missing_reference"), true);

  const matches = matchStatementMovements(
    movements,
    [
      {
        transferReference: "PF-TF-20260905-ABC123DEAD",
        expectedAmountMinor: 1_500_000,
        currency: "AOA",
        status: "awaiting_transfer",
        paymentStatus: "pending",
        schoolId: "school-a",
      },
      {
        transferReference: "PF-TF-20260905-FFFF000011",
        expectedAmountMinor: 800_000,
        currency: "AOA",
        status: "awaiting_transfer",
        paymentStatus: "pending",
        schoolId: "school-a",
      },
    ],
    { schoolId: "school-a" },
  );

  assert.equal(matches[0].outcome, "matched");
  assert.equal(matches[1].outcome, "amount_mismatch");
  assert.equal(matches[2].outcome, "invalid_row");
  assert.equal(matches[3].outcome, "duplicate_transaction");
});

test("does not match a transfer absent from the school-scoped pending list", () => {
  const csv =
    "referencia;valor;moeda;movimento;data\nPF-TF-20260905-SCHOOLB01;100,00;AOA;TX-1;2026-09-05\n";
  const movements = parseBankStatementCsv(csv);
  const matches = matchStatementMovements(movements, [], { schoolId: "school-a" });
  assert.equal(matches[0].outcome, "unknown_reference");
});
