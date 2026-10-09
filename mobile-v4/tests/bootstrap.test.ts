import { describe, expect, it } from "vitest";
import { ApiGateway } from "../src/services/api";
import { institutionalGateway } from "../src/services/bootstrap";

describe("institutional API bootstrap", () => {
  it("keeps the public preview disconnected by default", () => {
    expect(institutionalGateway(undefined)).toBeUndefined();
    expect(institutionalGateway("")).toBeUndefined();
    expect(institutionalGateway("demo")).toBeUndefined();
    expect(institutionalGateway("true")).toBeUndefined();
  });

  it("only enables the same-origin API through explicit institutional configuration", () => {
    expect(() => institutionalGateway("institutional")).toThrow("sessão institucional");
    expect(
      institutionalGateway("institutional", { accessToken: async () => "verified-session" }),
    ).toBeInstanceOf(ApiGateway);
  });
});
