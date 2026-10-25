import test from "node:test";
import assert from "node:assert/strict";
import { capabilityEnabled, publicIntegrationState, validateLaunchUrl } from "./integrations.ts";
const integration = {
  schoolId: "school",
  provider: "zoom",
  version: 1,
  configured: true,
  authorized: true,
  supported: ["room.join"],
  granted: ["room.join"],
  verifiedAt: null,
};
test("installed capabilities never override tenant, authorization or support", () => {
  assert.equal(capabilityEnabled(integration, "school", "room.join"), true);
  for (const variant of [
    { schoolId: "other" },
    { authorized: false },
    { supported: [] },
    { granted: [] },
    { configured: false },
  ])
    assert.equal(capabilityEnabled({ ...integration, ...variant }, "school", "room.join"), false);
});
test("capability response is explicit and excludes unknown secret fields", () => {
  const response = publicIntegrationState({ ...integration, secret: "private" }, "school");
  assert.equal(response.state, "configured");
  assert.ok(!JSON.stringify(response).includes("private"));
  assert.throws(() => publicIntegrationState(integration, "other"));
});
test("launch refuses lookalike hosts, scripts, credentials and arbitrary providers", () => {
  for (const url of [
    "https://zoom.us.evil.test/j/123",
    "javascript:alert(1)",
    "https://user:pass@zoom.us/j/123",
    "https://zoom.us:8443/j/123",
    "https://zoom.us/profile",
  ])
    assert.throws(() => validateLaunchUrl("zoom", url));
  assert.equal(
    validateLaunchUrl("zoom", "https://school.zoom.us/j/123"),
    "https://school.zoom.us/j/123",
  );
});
test("WhatsApp accepts only institutional invite form, not arbitrary web links", () => {
  assert.doesNotThrow(() =>
    validateLaunchUrl("whatsapp", "https://chat.whatsapp.com/AbCdEfGh123456"),
  );
  assert.throws(() => validateLaunchUrl("whatsapp", "https://web.whatsapp.com/"));
});
test("BBB requires the exact configured origin", () => {
  assert.throws(() =>
    validateLaunchUrl(
      "bigbluebutton",
      "https://other.test/bigbluebutton/api/join",
      "https://school.test",
    ),
  );
  assert.doesNotThrow(() =>
    validateLaunchUrl(
      "bigbluebutton",
      "https://school.test/bigbluebutton/api/join?checksum=abc",
      "https://school.test",
    ),
  );
});

test("disconnected and unauthorized integrations advertise no usable capabilities", () => {
  assert.deepEqual(
    publicIntegrationState({ ...integration, configured: false }, "school").capabilities,
    [],
  );
  assert.deepEqual(
    publicIntegrationState({ ...integration, authorized: false }, "school").capabilities,
    [],
  );
  assert.deepEqual(
    publicIntegrationState({ ...integration, supported: ["room.join", "room.join"] }, "school")
      .capabilities,
    ["room.join"],
  );
});
test("launch links with fragments are refused", () => {
  assert.throws(() => validateLaunchUrl("zoom", "https://zoom.us/j/123#redirect"));
});
