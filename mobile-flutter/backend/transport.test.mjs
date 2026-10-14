import test from "node:test";
import assert from "node:assert/strict";
import { authorizeTrip, validatePosition, positionState } from "./transport.ts";
const grant = {
  userId: "user",
  schoolId: "a",
  active: true,
  aal: "aal2",
  role: "guardian",
  tripIds: ["trip"],
};
const now = new Date("2026-10-13T07:00:00Z");
const pos = {
  schoolId: "a",
  tripId: "trip",
  deviceId: "device",
  capturedAt: now.toISOString(),
  latitude: -12,
  longitude: 17,
  accuracyMeters: 10,
};
test("guardian reads only assigned trip and cannot write", () => {
  assert.doesNotThrow(() => authorizeTrip(grant, "a", "trip"));
  for (const args of [
    ["b", "trip"],
    ["a", "other"],
    ["a", "trip", true],
  ])
    assert.throws(() => authorizeTrip(grant, ...args));
});
test("inactive and aal1 driver cannot write", () => {
  assert.throws(() => authorizeTrip({ ...grant, active: false }, "a", "trip"));
  assert.throws(() => authorizeTrip({ ...grant, role: "driver", aal: "aal1" }, "a", "trip", true));
});
test("device assignment rejects cross-school position", () => {
  assert.throws(() => validatePosition({ ...pos, schoolId: "b" }, pos, now));
  assert.throws(() => validatePosition({ ...pos, deviceId: "other" }, pos, now));
});
test("invalid coordinates and future positions refused", () => {
  for (const change of [
    { latitude: NaN },
    { longitude: 181 },
    { accuracyMeters: -1 },
    { capturedAt: "2026-10-14T07:00:00Z" },
  ])
    assert.throws(() => validatePosition({ ...pos, ...change }, pos, now));
});
test("missing, stale and ended GPS never masquerade as live", () => {
  assert.equal(positionState(null, now, true), "awaiting");
  assert.equal(positionState({ ...pos, capturedAt: "2026-10-13T06:55:00Z" }, now, true), "stale");
  assert.equal(positionState(pos, now, false), "ended");
  assert.equal(positionState(pos, now, true), "live");
});

test("unrecognized transport profile cannot read or write", () => {
  assert.throws(() => authorizeTrip({ ...grant, role: "platform_admin" }, "a", "trip"));
});
test("GPS timestamp without timezone and invalid clock are refused", () => {
  assert.throws(() => validatePosition({ ...pos, capturedAt: "2026-10-13T07:00:00" }, pos, now));
  assert.throws(() => validatePosition(pos, pos, new Date("invalid")));
});
