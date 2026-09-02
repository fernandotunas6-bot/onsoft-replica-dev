import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("notify-ci-failure.mjs", () => {
  it("sai 0 quando Slack e Resend não estão configurados", () => {
    const script = path.join(process.cwd(), "scripts/siga/notify-ci-failure.mjs");
    const result = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        SLACK_E2E_WEBHOOK_URL: "",
        RESEND_API_KEY: "",
        E2E_ALERT_EMAIL_TO: "",
      },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("omitido");
  });
});
