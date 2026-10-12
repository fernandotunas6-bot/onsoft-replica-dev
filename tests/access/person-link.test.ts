import { describe, expect, it } from "vitest";
import { linkPersonByEmail, personLinkWarning } from "@/features/access/person-link";

type Row = {
  id: string;
  school_id: string;
  email: string | null;
  user_id: string | null;
  deleted_at?: string | null;
};
/** Fichas em memória; o ILIKE trata «_» e «%» como curingas, como o Postgres. */
function database(rows: Row[], options: { raceOnUpdate?: boolean; failRead?: boolean } = {}) {
  const updates: { id: string; user_id: string }[] = [];
  const db = {
    from: () => {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Partial<Row> | null = null;
      let limit = Infinity;
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: (n: number) => ((limit = n), chain),
        eq: (f: keyof Row, v: unknown) => (filters.push((r) => r[f] === v), chain),
        is: (f: keyof Row, v: unknown) => (filters.push((r) => (r[f] ?? null) === v), chain),
        ilike: (f: keyof Row, pattern: string) => {
          const re = new RegExp(
            "^" +
              pattern.replace(/\\([\\%_])|([%_])|([^\\%_]+)/g, (_m, esc, wild, text) =>
                esc
                  ? esc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                  : wild
                    ? wild === "%"
                      ? ".*"
                      : "."
                    : text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              ) +
              "$",
            "i",
          );
          filters.push((r) => re.test(String(r[f] ?? "")));
          return chain;
        },
        update: (p: Partial<Row>) => ((patch = p), chain),
        maybeSingle: async () => {
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          if (!patch || options.raceOnUpdate || !hit.length) return { data: null, error: null };
          Object.assign(hit[0]!, patch);
          updates.push({ id: hit[0]!.id, user_id: String(patch.user_id) });
          return { data: { id: hit[0]!.id }, error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          options.failRead
            ? resolve({ data: null, error: { message: "x" } })
            : resolve({
                data: rows.filter((r) => filters.every((f) => f(r))).slice(0, limit),
                error: null,
              }),
      };
      return chain;
    },
  };
  return { db, updates };
}
const S = "school";
const row = (
  id: string,
  email: string | null,
  user_id: string | null = null,
  school_id = S,
): Row => ({
  id,
  school_id,
  email,
  user_id,
  deleted_at: null,
});

describe("ligar a conta à ficha pelo e-mail", () => {
  it("liga sem olhar a maiúsculas nem espaços", async () => {
    const { db, updates } = database([row("p1", " Ana@Escola.AO ")]);
    expect(await linkPersonByEmail(db, S, "ana@escola.ao", "u1")).toBe("linked");
    expect(updates).toEqual([{ id: "p1", user_id: "u1" }]);
  });

  it("não confunde «_» com qualquer letra", async () => {
    const { db, updates } = database([row("p1", "ana.silva@escola.ao")]);
    expect(await linkPersonByEmail(db, S, "ana_silva@escola.ao", "u1")).toBe("no-record");
    expect(updates).toEqual([]);
  });

  it("nunca troca a conta de uma ficha já ligada", async () => {
    const { db, updates } = database([row("p1", "ana@escola.ao", "outra-conta")]);
    expect(await linkPersonByEmail(db, S, "ana@escola.ao", "u1")).toBe("taken");
    expect(updates).toEqual([]);
  });

  it("com duas fichas sem conta e o mesmo e-mail, não adivinha", async () => {
    const { db, updates } = database([row("p1", "ana@escola.ao"), row("p2", "ANA@escola.ao")]);
    expect(await linkPersonByEmail(db, S, "ana@escola.ao", "u1")).toBe("ambiguous");
    expect(updates).toEqual([]);
  });

  it("é idempotente e ignora outras escolas e fichas apagadas", async () => {
    const tables = [
      row("p1", "ana@escola.ao", "u1"),
      row("p2", "ana@escola.ao", null, "outra-escola"),
      { ...row("p3", "ana@escola.ao"), deleted_at: "2026-01-01" },
    ];
    const { db, updates } = database(tables);
    expect(await linkPersonByEmail(db, S, "ana@escola.ao", "u1")).toBe("linked");
    expect(updates).toEqual([]);
  });

  it("se outra conta ganhou a ficha entretanto, diz que está tomada", async () => {
    const { db } = database([row("p1", "ana@escola.ao")], { raceOnUpdate: true });
    expect(await linkPersonByEmail(db, S, "ana@escola.ao", "u1")).toBe("taken");
  });

  it("encontra a ficha exacta mesmo entre muitos e-mails parecidos", async () => {
    const lookalikes = Array.from({ length: 1200 }, (_, i) => row(`x${i}`, `jo${i}ana@escola.ao`));
    const { db, updates } = database([...lookalikes, row("p1", "ana@escola.ao")]);
    expect(await linkPersonByEmail(db, S, "ana@escola.ao", "u1")).toBe("linked");
    expect(updates).toEqual([{ id: "p1", user_id: "u1" }]);
  });

  it("uma falha da base sobe, para o aviso não culpar o e-mail", async () => {
    const { db } = database([row("p1", "ana@escola.ao")], { failRead: true });
    await expect(linkPersonByEmail(db, S, "ana@escola.ao", "u1")).rejects.toThrow();
    expect(personLinkWarning("error", "Aluno")).toMatch(/não foi possível ligá-la à ficha agora/);
    expect(personLinkWarning("error", "Aluno")).not.toMatch(/Corrija o e-mail/);
  });

  it("avisa quem criou a conta de aluno ou professor sem ficha ligada", () => {
    expect(personLinkWarning("linked", "Aluno")).toBeNull();
    expect(personLinkWarning("no-record", "Secretaria")).toBeNull();
    expect(personLinkWarning("no-record", "Aluno")).toMatch(
      /nenhuma ficha da escola tem este e-mail/,
    );
    expect(personLinkWarning("ambiguous", "Professor")).toMatch(/mais de uma ficha/);
    expect(personLinkWarning("taken", "Encarregado")).toMatch(/ligada a outra conta/);
  });
});
