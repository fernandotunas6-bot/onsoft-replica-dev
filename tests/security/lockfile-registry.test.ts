import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O bun.lock só pode apontar para o registo público (entrada vazia = registo
 * por omissão). Endereços da cache privada do Lovable davam 403 a quem instala
 * fora dele — CI do GitHub incluído —, e o `bun install --frozen-lockfile`
 * falhava antes de correr qualquer teste. Corrigir trocando o endereço por ""
 * (o hash sha512 mantém-se e o Bun verifica-o ao instalar).
 */
describe("bun.lock", () => {
  it("não aponta para registos privados", () => {
    const lock = readFileSync(join(process.cwd(), "bun.lock"), "utf8");
    const privados = [...lock.matchAll(/"https:\/\/[^"]*pkg\.dev[^"]*"/g)].map((m) => m[0]);
    expect(privados.slice(0, 5), `${privados.length} entradas com registo privado`).toEqual([]);
  });
});
