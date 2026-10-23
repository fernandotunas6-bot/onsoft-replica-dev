import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ISPAB_DEMO,
  ispabDemoInput,
  sealDemoCredentials,
} from "../../scripts/siga/ispab-demo-config";

describe("cadastro demonstrativo ISPAB", () => {
  it("identifica os dados fictícios e não usa um destinatário real", () => {
    const input = ispabDemoInput("Fixture-only-password123");
    expect(input.name).toContain("Demonstração");
    expect(input.nif).toMatch(/^DEMO/);
    expect(input.admin_email).toBe("ispab-admin@example.invalid");
    expect(input.email).toBe(input.admin_email);
    expect(input.teaching_levels).toEqual(["superior"]);
    expect(input.slug).toBe("ispab");
    expect(ISPAB_DEMO.contact_role).not.toMatch(/director/i);
  });

  it("só a chave privada local abre as credenciais do artefacto público", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 4096 });
    const input = {
      email: ISPAB_DEMO.admin_email,
      password: "Private-fixture-123",
      portal: "https://school.example/portal",
    };
    const encrypted = sealDemoCredentials(
      input,
      publicKey.export({ type: "spki", format: "pem" }).toString(),
    );
    expect(encrypted.toString()).not.toContain(input.password);
    const decrypted = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      encrypted,
    );
    expect(JSON.parse(decrypted.toString())).toEqual(input);
  });

  it("recusa chaves de tamanho insuficiente antes de provisionar", () => {
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() =>
      sealDemoCredentials(
        { password: "fixture" },
        publicKey.export({ type: "spki", format: "pem" }).toString(),
      ),
    ).toThrow("4096");
  });
});
