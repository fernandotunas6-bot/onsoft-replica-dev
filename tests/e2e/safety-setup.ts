import { assertSafeE2ETarget } from "../../scripts/siga/e2e-safety.mjs";

export default function safetySetup() {
  if (["1", "true"].includes(process.env.SIGA_E2E_LIVE ?? "")) assertSafeE2ETarget();
}
