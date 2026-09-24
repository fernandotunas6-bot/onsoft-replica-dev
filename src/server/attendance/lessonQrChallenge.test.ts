import { describe, expect, it } from "vitest";
import { consumeLessonQr, importLessonQrKey, issueLessonQr, type AtomicQrConsumer } from "./lessonQrChallenge";

const identity = {
  schoolId: "school-1", snapshotId: "published-v1", lessonId: "lesson-1",
  teacherId: "teacher-1", operation: "check_in" as const,
};
const now = Date.parse("2026-09-24T08:00:00+01:00");
function memoryConsumer(): AtomicQrConsumer {
  const seen = new Set<string>();
  return { async consume({ nonceHash }) {
    if (seen.has(nonceHash)) return false;
    seen.add(nonceHash);
    return true;
  } };
}
describe("desafio QR docente assinado", () => {
  it("aceita uma única leitura e bloqueia duas leituras concorrentes", async () => {
    const key = await importLessonQrKey(crypto.getRandomValues(new Uint8Array(32)));
    const token = await issueLessonQr(identity, key, now);
    const store = memoryConsumer();
    const results = await Promise.all([
      consumeLessonQr(token, identity, key, store, now + 1000),
      consumeLessonQr(token, identity, key, store, now + 1000),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });
  it("não aceita token adulterado, expirado ou de outra escola, docente, aula e operação", async () => {
    const key = await importLessonQrKey(crypto.getRandomValues(new Uint8Array(32)));
    const token = await issueLessonQr(identity, key, now);
    const store = memoryConsumer();
    for (const expected of [
      { ...identity, schoolId: "school-2" }, { ...identity, teacherId: "teacher-2" },
      { ...identity, lessonId: "lesson-2" }, { ...identity, snapshotId: "published-v2" },
      { ...identity, operation: "check_out" as const },
    ]) expect(await consumeLessonQr(token, expected, key, store, now + 1000)).toBe(false);
    expect(await consumeLessonQr(token + "a", identity, key, store, now + 1000)).toBe(false);
    expect(await consumeLessonQr(token, identity, key, store, now + 60_000)).toBe(false);
    expect(await consumeLessonQr(token, identity, key, store, now + 1000)).toBe(true);
  });
  it("rejeita uma chave curta, prazo longo e relógio antes da emissão", async () => {
    await expect(importLessonQrKey(new Uint8Array(16))).rejects.toThrow();
    const key = await importLessonQrKey(crypto.getRandomValues(new Uint8Array(32)));
    await expect(issueLessonQr(identity, key, now, 120_001)).rejects.toThrow();
    const token = await issueLessonQr(identity, key, now);
    expect(await consumeLessonQr(token, identity, key, memoryConsumer(), now - 5001)).toBe(false);
  });
});
