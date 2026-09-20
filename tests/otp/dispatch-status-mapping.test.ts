import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapTwilioStatus } from "@/features/otp/webhooks/twilio-webhook-handler";
import { mapWhatsAppStatus } from "@/features/otp/webhooks/whatsapp-webhook-handler";

/**
 * O estado de entrega é uma coluna `dispatch_status`, um enum do Postgres. Um
 * valor fora do enum não é um registo errado — é um UPDATE que falha, com o
 * erro engolido por um `console.error`.
 *
 * Isto esteve escondido duas vezes: a tabela não existia em produção (a
 * migração nunca tinha sido aplicável), e o erro era descartado. Os mapas
 * devolviam `"processing"` e `"unknown"`, que o enum não tem.
 *
 * O enum é lido do ficheiro de migração, não copiado para aqui: se alguém
 * acrescentar um estado, este teste passa a aceitá-lo sem precisar de edição —
 * e se alguém remover um, falha.
 */

const ENUM_DISPATCH_STATUS = (() => {
  const sql = readFileSync(
    resolve(
      __dirname,
      "../../supabase/migrations/20260911120000_central_communication_and_otp.sql",
    ),
    "utf8",
  );
  const bloco = sql.slice(sql.indexOf("CREATE TYPE dispatch_status"));
  const valores = bloco.slice(0, bloco.indexOf(")")).matchAll(/'([a-z_]+)'/g);
  return new Set([...valores].map((m) => m[1]));
})();

describe("estados de entrega dentro do enum", () => {
  it("o enum foi lido da migração", () => {
    expect(ENUM_DISPATCH_STATUS.size).toBeGreaterThanOrEqual(8);
    expect(ENUM_DISPATCH_STATUS.has("delivered")).toBe(true);
    expect(ENUM_DISPATCH_STATUS.has("queued")).toBe(true);
    // Os dois que os mapas devolviam e nunca existiram.
    expect(ENUM_DISPATCH_STATUS.has("processing")).toBe(false);
    expect(ENUM_DISPATCH_STATUS.has("unknown")).toBe(false);
  });

  const ESTADOS_TWILIO = [
    "queued",
    "sending",
    "sent",
    "delivered",
    "undelivered",
    "failed",
    "accepted",
    "scheduled",
  ];

  it.each(ESTADOS_TWILIO)("Twilio «%s» traduz para um valor do enum", (estado) => {
    const mapeado = mapTwilioStatus(estado);
    expect(mapeado, `${estado} não devia ficar sem tradução`).not.toBeNull();
    expect(ENUM_DISPATCH_STATUS.has(mapeado as string)).toBe(true);
  });

  const ESTADOS_META = ["sent", "delivered", "read", "failed"];

  it.each(ESTADOS_META)("Meta «%s» traduz para um valor do enum", (estado) => {
    const mapeado = mapWhatsAppStatus(estado);
    expect(mapeado, `${estado} não devia ficar sem tradução`).not.toBeNull();
    expect(ENUM_DISPATCH_STATUS.has(mapeado as string)).toBe(true);
  });

  it("um estado desconhecido não inventa valor", () => {
    // O chamador trata `null` não escrevendo nada: melhor manter o registo como
    // está do que perder o estado anterior num UPDATE que a base recusa.
    expect(mapTwilioStatus("teletransportado")).toBeNull();
    expect(mapWhatsAppStatus("teletransportado")).toBeNull();
    expect(mapTwilioStatus("")).toBeNull();
  });

  it("«read» do WhatsApp não é colapsado em «delivered»", () => {
    // O enum distingue os dois, e ler é mais informativo do que entregar.
    expect(mapWhatsAppStatus("read")).toBe("opened");
    expect(mapWhatsAppStatus("delivered")).toBe("delivered");
  });

  it("todo o valor devolvido é sempre do enum, para qualquer entrada", () => {
    const entradas = [...ESTADOS_TWILIO, ...ESTADOS_META, "x", "DELIVERED", "sent ", "0"];
    for (const entrada of entradas) {
      for (const mapeado of [mapTwilioStatus(entrada), mapWhatsAppStatus(entrada)]) {
        if (mapeado !== null) {
          expect(ENUM_DISPATCH_STATUS.has(mapeado), `«${entrada}» → «${mapeado}»`).toBe(true);
        }
      }
    }
  });
});

/**
 * As colunas que os handlers escrevem têm de existir na tabela.
 *
 * Os dois handlers gravavam `delivered_at`, que a tabela não tinha: o caso
 * «entregue» — o mais comum de todos — era o único que falhava, com PGRST204
 * descartado num `console.error`. A coluna foi acrescentada à migração; este
 * teste impede a próxima divergência, lendo os dois lados em vez de os assumir.
 */
describe("as colunas escritas pelos handlers existem na tabela", () => {
  const COLUNAS_DISPATCHES = (() => {
    const sql = readFileSync(
      resolve(
        __dirname,
        "../../supabase/migrations/20260911120000_central_communication_and_otp.sql",
      ),
      "utf8",
    );
    const início = sql.indexOf("CREATE TABLE IF NOT EXISTS public.communication_dispatches");
    const corpo = sql.slice(início, sql.indexOf("\n);", início));
    // `[A-Za-z]`, não `[A-Z]`: há colunas cujo tipo é um enum em minúsculas
    // (`status dispatch_status`, `channel communication_channel`) e a primeira
    // versão deste teste não as via — acusava o handler de gravar `status` numa
    // tabela que tem `status`.
    return new Set([...corpo.matchAll(/\n {2}([a-z_]+) [A-Za-z]/g)].map((m) => m[1]));
  })();

  /** Chaves que cada handler grava: `updatePayload.x =` e as do objecto do insert. */
  function colunasEscritasPor(ficheiro: string): string[] {
    const código = readFileSync(resolve(__dirname, "../..", ficheiro), "utf8");
    const porAtribuição = [...código.matchAll(/updatePayload\.([a-z_]+)\s*=/g)].map((m) => m[1]);
    const objecto = código.slice(código.indexOf("const updatePayload"));
    const porLiteral = [
      ...objecto.slice(0, objecto.indexOf("};")).matchAll(/\n\s+([a-z_]+):/g),
    ].map((m) => m[1]);
    return [...new Set([...porAtribuição, ...porLiteral])];
  }

  it("a tabela foi lida da migração", () => {
    expect(COLUNAS_DISPATCHES.size).toBeGreaterThanOrEqual(12);
    expect(COLUNAS_DISPATCHES.has("delivered_at")).toBe(true);
    expect(COLUNAS_DISPATCHES.has("external_message_id")).toBe(true);
  });

  it.each([
    "src/features/otp/webhooks/twilio-webhook-handler.ts",
    "src/features/otp/webhooks/whatsapp-webhook-handler.ts",
  ])("%s só escreve colunas que existem", (ficheiro) => {
    const escritas = colunasEscritasPor(ficheiro);
    expect(escritas.length).toBeGreaterThanOrEqual(2);
    const inexistentes = escritas.filter((coluna) => !COLUNAS_DISPATCHES.has(coluna));
    expect(
      inexistentes,
      `${ficheiro} grava colunas que communication_dispatches não tem: ${inexistentes.join(", ")}. ` +
        `Em produção isto é PGRST204 e o estado de entrega perde-se em silêncio.`,
    ).toEqual([]);
  });
});
