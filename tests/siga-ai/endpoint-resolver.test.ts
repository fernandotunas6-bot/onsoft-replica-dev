/**
 * O endpoint do serviço de IA é escrito por um administrador de escola e usado
 * pelo servidor com a chave de serviço. Sem estas recusas, é um SSRF.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AiEndpointError,
  assertSafeAiEndpoint,
  resolveAiEndpoints,
} from "@/lib/siga-ai/endpoint-resolver.server";

const base = {
  enabled: true,
  mode: "local" as const,
  endpoint_url: null,
  vector_url: null,
  chat_model: null,
  remote_allowed: false,
};

describe("endpoint do SIGA AI", () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env["SIGA_AI_OLLAMA_URL"];
    delete process.env["SIGA_AI_QDRANT_URL"];
    delete process.env["SIGA_AI_ALLOWED_HOSTS"];
    process.env["NODE_ENV"] = "test";
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("aceita a rede local fora de produção e normaliza a barra final", () => {
    expect(assertSafeAiEndpoint("http://127.0.0.1:11434/")).toBe("http://127.0.0.1:11434");
    expect(assertSafeAiEndpoint("http://192.168.1.50:11434")).toBe("http://192.168.1.50:11434");
  });

  it("recusa esquemas, credenciais e parâmetros", () => {
    for (const bad of [
      "file:///etc/passwd",
      "ftp://servidor/ia",
      "http://user:senha@127.0.0.1:11434",
      "http://127.0.0.1:11434?x=1",
      "não é um url",
    ]) {
      expect(() => assertSafeAiEndpoint(bad), bad).toThrow(AiEndpointError);
    }
  });

  it("em produção só passa o que está na lista de permissões", () => {
    process.env["NODE_ENV"] = "production";
    expect(() => assertSafeAiEndpoint("http://127.0.0.1:11434")).toThrow(AiEndpointError);
    expect(() => assertSafeAiEndpoint("http://169.254.169.254/latest/meta-data")).toThrow(
      AiEndpointError,
    );
    process.env["SIGA_AI_ALLOWED_HOSTS"] = "ia.escola.ao, outro.ao";
    expect(assertSafeAiEndpoint("https://ia.escola.ao")).toBe("https://ia.escola.ao");
  });

  it("sem configuração nem ambiente, diz que falta configurar", () => {
    try {
      resolveAiEndpoints(base);
      throw new Error("devia ter recusado");
    } catch (error) {
      expect(error).toBeInstanceOf(AiEndpointError);
      expect((error as AiEndpointError).code).toBe("not_configured");
    }
  });

  it("o modo remoto exige autorização explícita da escola", () => {
    process.env["SIGA_AI_OLLAMA_URL"] = "https://ia.institucional.ao";
    expect(() => resolveAiEndpoints({ ...base, mode: "remote" })).toThrow(AiEndpointError);
    const resolved = resolveAiEndpoints({ ...base, mode: "remote", remote_allowed: true });
    expect(resolved.chatBaseUrl).toBe("https://ia.institucional.ao");
  });

  it("a configuração da escola ganha ao ambiente", () => {
    process.env["SIGA_AI_OLLAMA_URL"] = "http://127.0.0.1:11434";
    const resolved = resolveAiEndpoints({
      ...base,
      mode: "school_server",
      endpoint_url: "http://10.0.0.5:11434",
      vector_url: "http://10.0.0.5:6333",
      chat_model: "qwen2.5:7b",
    });
    expect(resolved.chatBaseUrl).toBe("http://10.0.0.5:11434");
    expect(resolved.vectorBaseUrl).toBe("http://10.0.0.5:6333");
    expect(resolved.chatModel).toBe("qwen2.5:7b");
  });

  it("sem Qdrant, a base documental fica nula em vez de rebentar", () => {
    process.env["SIGA_AI_OLLAMA_URL"] = "http://127.0.0.1:11434";
    expect(resolveAiEndpoints(base).vectorBaseUrl).toBeNull();
  });
});
