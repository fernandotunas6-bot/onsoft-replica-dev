import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isFirebaseMessagingSupported,
  requestNotificationPermission,
  getCachedFcmToken,
  getFcmToken,
  useFirebaseNotifications,
} from "@/integrations/firebase/messaging";
import { defaultFirebaseConfig, getFirebaseApp } from "@/integrations/firebase/firebase";

describe("Firebase Cloud Messaging (FCM) for Android/Web/PWA", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("has valid Firebase config for siga-plus-3ba9c", () => {
    expect(defaultFirebaseConfig.projectId).toBe("siga-plus-3ba9c");
    expect(defaultFirebaseConfig.appId).toBe("1:1051179373088:web:62ffc7fccf3ad61262e245");
    expect(defaultFirebaseConfig.messagingSenderId).toBe("1051179373088");
  });

  it("handles environment detection gracefully when Push/ServiceWorker is absent", async () => {
    // In standard node test environment without serviceWorker
    const isSupported = await isFirebaseMessagingSupported();
    expect(typeof isSupported).toBe("boolean");
  });

  it("returns null or cached value from getCachedFcmToken", () => {
    const token = getCachedFcmToken();
    expect(token === null || typeof token === "string").toBe(true);
  });

  it("handles permission request safely in non-browser/mock environment", async () => {
    const perm = await requestNotificationPermission();
    expect(["granted", "denied", "default"]).toContain(perm);
  });

  it("exports notification hooks and helpers correctly", () => {
    expect(typeof useFirebaseNotifications).toBe("function");
    expect(typeof getFcmToken).toBe("function");
  });
});
