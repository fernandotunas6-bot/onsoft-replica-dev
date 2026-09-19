import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent, type Analytics } from "firebase/analytics";

export interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

export const defaultFirebaseConfig: FirebaseClientConfig = {
  projectId:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_PROJECT_ID) ||
    "siga-plus-3ba9c",
  appId:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_APP_ID) ||
    "1:1051179373088:web:62ffc7fccf3ad61262e245",
  apiKey:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_API_KEY) ||
    "AIzaSyCLOIqKSrOru6yTCf7uK-LI0OWZbG_QZws",
  authDomain:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) ||
    "siga-plus-3ba9c.firebaseapp.com",
  storageBucket:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) ||
    "siga-plus-3ba9c.firebasestorage.app",
  messagingSenderId:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    "1051179373088",
  measurementId:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID) ||
    "G-F99KXGH8CF",
  oAuthClientId: "",
  recaptchaSiteKey: "",
};

let firebaseApp: FirebaseApp | null = null;
let firebaseAnalytics: Analytics | null = null;
let analyticsInitialized = false;

/**
 * Initializes or returns the singleton Firebase app instance.
 */
export function getFirebaseApp(customConfig?: Partial<FirebaseClientConfig>): FirebaseApp {
  if (firebaseApp) return firebaseApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0]!;
    return firebaseApp;
  }

  const config = {
    ...defaultFirebaseConfig,
    ...customConfig,
  };

  firebaseApp = initializeApp(config);
  return firebaseApp;
}

/**
 * Initializes and returns Firebase Analytics if running in a supported browser environment.
 * Desligado por defeito — activar com VITE_FIREBASE_ANALYTICS=true (não faz parte do núcleo SIGA).
 */
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (import.meta.env.VITE_FIREBASE_ANALYTICS !== "true") {
    analyticsInitialized = true;
    firebaseAnalytics = null;
    return null;
  }
  if (analyticsInitialized) return firebaseAnalytics;

  try {
    const supported = await isSupported();
    if (supported) {
      const app = getFirebaseApp();
      firebaseAnalytics = getAnalytics(app);
      analyticsInitialized = true;
    }
  } catch (error) {
    console.warn("[Firebase] Analytics initialization skipped or unsupported:", error);
  }

  return firebaseAnalytics;
}

/**
 * Log custom events to Firebase Analytics.
 */
export async function logFirebaseEvent(
  eventName: string,
  eventParams?: Record<string, unknown>,
): Promise<void> {
  try {
    const analytics = await getFirebaseAnalytics();
    if (analytics) {
      logEvent(analytics, eventName, eventParams);
    }
  } catch (error) {
    console.debug("[Firebase] Event log skipped:", eventName, error);
  }
}

/**
 * Crashlytics & Error Reporting interface for Web / Hybrid App
 */
export interface CrashlyticsLogger {
  recordError: (error: Error | unknown, context?: Record<string, unknown>) => void;
  log: (message: string) => void;
  setUserId: (userId: string | null) => void;
  setCustomKey: (key: string, value: string | number | boolean) => void;
}

class CrashlyticsService implements CrashlyticsLogger {
  private userId: string | null = null;
  private customKeys: Record<string, string | number | boolean> = {};

  recordError(error: Error | unknown, context?: Record<string, unknown>): void {
    const errObj = error instanceof Error ? error : new Error(String(error));
    const errorPayload = {
      message: errObj.message,
      name: errObj.name,
      stack: errObj.stack,
      userId: this.userId,
      customKeys: this.customKeys,
      context: context ?? {},
      timestamp: new Date().toISOString(),
    };

    console.error("[Crashlytics] Recorded exception:", errorPayload);

    // Also send as exception event to Analytics if available
    logFirebaseEvent("app_exception", {
      description: errObj.message.slice(0, 100),
      fatal: false,
      ...context,
    });
  }

  log(message: string): void {
    console.info(`[Crashlytics Log] ${message}`);
  }

  setUserId(userId: string | null): void {
    this.userId = userId;
    if (userId) {
      logFirebaseEvent("set_user_id", { userId });
    }
  }

  setCustomKey(key: string, value: string | number | boolean): void {
    this.customKeys[key] = value;
  }
}

export const crashlytics: CrashlyticsLogger = new CrashlyticsService();

// Export default singleton setup
export const app =
  typeof window !== "undefined" && import.meta.env.VITE_FIREBASE_ANALYTICS === "true"
    ? getFirebaseApp()
    : null;
