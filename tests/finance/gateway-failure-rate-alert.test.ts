import { describe, expect, it } from "vitest";
import {
  evaluateGatewayFailureRateAlert,
  formatGatewayFailureRateAlertMessage,
  parseGatewayFailureRateAlertConfig,
} from "@/features/finance/gateway-failure-rate-alert";

describe("parseGatewayFailureRateAlertConfig", () => {
  it("retorna null sem Slack nem Resend", () => {
    expect(
      parseGatewayFailureRateAlertConfig({
        SIGA_GATEWAY_FAILURE_RATE_ALERT_SLACK_URL: "",
        RESEND_API_KEY: "",
        SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_TO: "",
      }),
    ).toBeNull();
  });

  it("aceita Slack com limiares por defeito", () => {
    const config = parseGatewayFailureRateAlertConfig({
      SIGA_GATEWAY_FAILURE_RATE_ALERT_SLACK_URL: "https://hooks.slack.com/test",
    });
    expect(config?.threshold).toBe(0.25);
    expect(config?.minEvents).toBe(5);
    expect(config?.cooldownMs).toBe(6 * 60 * 60 * 1000);
  });
});

describe("evaluateGatewayFailureRateAlert", () => {
  const config = { threshold: 0.25, minEvents: 5 };

  it("não alerta com amostra pequena", () => {
    const result = evaluateGatewayFailureRateAlert({ total: 3, ok: 0, failed: 3 }, config);
    expect(result.alert).toBe(false);
    expect(result.reason).toContain("Amostra insuficiente");
  });

  it("não alerta abaixo do limiar", () => {
    const result = evaluateGatewayFailureRateAlert({ total: 10, ok: 9, failed: 1 }, config);
    expect(result.alert).toBe(false);
    expect(result.failureRate).toBe(0.1);
  });

  it("alerta quando taxa ≥ limiar", () => {
    const result = evaluateGatewayFailureRateAlert({ total: 8, ok: 4, failed: 4 }, config);
    expect(result.alert).toBe(true);
    expect(result.failureRate).toBe(0.5);
  });
});

describe("formatGatewayFailureRateAlertMessage", () => {
  it("inclui totais 24h", () => {
    const message = formatGatewayFailureRateAlertMessage(
      { alert: true, failureRate: 0.5, reason: "test" },
      { total: 8, ok: 4, failed: 4 },
    );
    expect(message.text).toContain("Total 24h: 8");
    expect(message.title).toContain("taxa de falha");
  });
});
