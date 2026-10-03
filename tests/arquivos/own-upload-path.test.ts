import { describe, expect, it } from "vitest";
import { isOwnUploadPath } from "@/features/arquivos/server";
import { localStoragePath } from "@/features/arquivos/local-store";

const school = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const file = "33333333-3333-4333-8333-333333333333";

describe("registar ficheiro: só o caminho do próprio envio", () => {
  it("aceita o caminho que o envio cria", () => {
    const path = localStoragePath({
      schoolId: school,
      area: "secretaria",
      ownerUserId: user,
      id: file,
      name: "Pauta final.pdf",
    });
    expect(isOwnUploadPath(path, school, user, file, "secretaria")).toBe(true);
  });

  it("recusa outra escola, outro dono, outro ficheiro ou outra área", () => {
    const other = "99999999-9999-4999-8999-999999999999";
    expect(
      isOwnUploadPath(
        `${other}/2026/10/secretaria/${user}/${file}-a.pdf`,
        school,
        user,
        file,
        "secretaria",
      ),
    ).toBe(false);
    expect(
      isOwnUploadPath(
        `${school}/2026/10/secretaria/${other}/${file}-a.pdf`,
        school,
        user,
        file,
        "secretaria",
      ),
    ).toBe(false);
    expect(
      isOwnUploadPath(
        `${school}/2026/10/secretaria/${user}/${other}-a.pdf`,
        school,
        user,
        file,
        "secretaria",
      ),
    ).toBe(false);
    expect(
      isOwnUploadPath(
        `${school}/2026/10/financeiro/${user}/${file}-a.pdf`,
        school,
        user,
        file,
        "secretaria",
      ),
    ).toBe(false);
  });

  it("recusa caminhos com «..», vazios ou com mais pastas", () => {
    expect(
      isOwnUploadPath(
        `${school}/2026/10/secretaria/${user}/../${file}-a.pdf`,
        school,
        user,
        file,
        "secretaria",
      ),
    ).toBe(false);
    expect(
      isOwnUploadPath(
        `${school}//10/secretaria/${user}/${file}-a.pdf`,
        school,
        user,
        file,
        "secretaria",
      ),
    ).toBe(false);
    expect(isOwnUploadPath(`folder/${file}`, school, user, file, "secretaria")).toBe(false);
  });
});
