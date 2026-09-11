/**
 * Firebase Mobile & Web Monitoring Service
 * Initialized from firebase-applet-config.json for hybrid and mobile analytics.
 * Fully decoupled and isolated from Supabase Authentication & Database operations.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAnalytics as getSdkAnalytics,
  isSupported,
  logEvent,
  type Analytics,
} from "firebase/analytics";
import configJson from "../../firebase-applet-config.json";

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

export const firebaseConfig: FirebaseClientConfig = {
  projectId:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_PROJECT_ID) ||
    configJson.projectId ||
    "siga-plus-3ba9c",
  appId:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_APP_ID) ||
    configJson.appId ||
    "1:1051179373088:web:62ffc7fccf3ad61262e245",
  apiKey:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_API_KEY) ||
    configJson.apiKey ||
    "AIzaSyCLOIqKSrOru6yTCf7uK-LI0OWZbG_QZws",
  authDomain:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) ||
    configJson.authDomain ||
    "siga-plus-3ba9c.firebaseapp.com",
  storageBucket:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) ||
    (configJson as { storageBucket?: string }).storageBucket ||
    "siga-plus-3ba9c.firebasestorage.app",
  messagingSenderId:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    (configJson as { messagingSenderId?: string }).messagingSenderId ||
    "1051179373088",
  measurementId:
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID) ||
    (configJson as { measurementId?: string }).measurementId ||
    "G-F99KXGH8CF",
  oAuthClientId: (configJson as { oAuthClientId?: string }).oAuthClientId || "",
  recaptchaSiteKey: (configJson as { recaptchaSiteKey?: string }).recaptchaSiteKey || "",
};

let firebaseAppInstance: FirebaseApp | null = null;
let analyticsInstance: Analytics | null = null;
let analyticsInitialized = false;

/**
 * Initializes or returns the singleton Firebase app instance.
 * Safe alongside existing Supabase sessions.
 */
export function getFirebaseApp(customConfig?: Partial<FirebaseClientConfig>): FirebaseApp {
  if (firebaseAppInstance) return firebaseAppInstance;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseAppInstance = existingApps[0]!;
    return firebaseAppInstance;
  }

  firebaseAppInstance = initializeApp({
    ...firebaseConfig,
    ...customConfig,
  });

  return firebaseAppInstance;
}

/**
 * App instance — só inicializa Firebase quando analytics está ligado
 * (`VITE_FIREBASE_ANALYTICS=true`) ou quando alguém chama getFirebaseApp().
 */
export const app: FirebaseApp | null =
  typeof window !== "undefined" && import.meta.env.VITE_FIREBASE_ANALYTICS === "true"
    ? getFirebaseApp()
    : null;

/**
 * Returns Firebase Analytics if supported by the runtime (browser/hybrid environment).
 * Desligado por defeito — activar com VITE_FIREBASE_ANALYTICS=true.
 */
export async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (import.meta.env.VITE_FIREBASE_ANALYTICS !== "true") {
    analyticsInitialized = true;
    analyticsInstance = null;
    return null;
  }
  if (analyticsInitialized) return analyticsInstance;

  try {
    const supported = await isSupported();
    if (supported) {
      const activeApp = getFirebaseApp();
      analyticsInstance = getSdkAnalytics(activeApp);
      analyticsInitialized = true;
    }
  } catch (err) {
    console.warn("[Firebase] Analytics is not supported in this environment:", err);
  }

  return analyticsInstance;
}

/**
 * Synchronous / wrapper accessor for getAnalytics.
 */
export function getAnalytics(targetApp?: FirebaseApp): Analytics | null {
  if (typeof window === "undefined") return null;
  if (import.meta.env.VITE_FIREBASE_ANALYTICS !== "true") return null;
  if (analyticsInstance) return analyticsInstance;
  try {
    const activeApp = targetApp || getFirebaseApp();
    analyticsInstance = getSdkAnalytics(activeApp);
    analyticsInitialized = true;
    return analyticsInstance;
  } catch {
    return null;
  }
}

/**
 * Web & Mobile Hybrid Crashlytics Logger interface.
 * Logs exceptions and breadcrumbs to Firebase Analytics and monitoring systems.
 */
export interface CrashlyticsService {
  recordError: (error: Error | unknown, context?: Record<string, unknown>) => void;
  log: (message: string) => void;
  setUserId: (userId: string | null) => void;
  setAttribute: (key: string, value: string | number | boolean) => void;
}

class MobileCrashlytics implements CrashlyticsService {
  private userId: string | null = null;
  private attributes: Record<string, string | number | boolean> = {};

  recordError(error: Error | unknown, context?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = {
      message: err.message,
      name: err.name,
      stack: err.stack,
      userId: this.userId,
      attributes: this.attributes,
      context: context ?? {},
      timestamp: new Date().toISOString(),
    };

    console.error("[Crashlytics] Recorded exception:", payload);

    if (typeof window !== "undefined") {
      getAnalyticsInstance()
        .then((analytics) => {
          if (analytics) {
            logEvent(analytics, "app_exception", {
              description: err.message.slice(0, 100),
              fatal: false,
              ...context,
            });
          }
        })
        .catch(() => {
          // silent catch
        });
    }
  }

  log(message: string): void {
    console.info(`[Crashlytics] ${message}`);
  }

  setUserId(userId: string | null): void {
    this.userId = userId;
    if (userId && typeof window !== "undefined") {
      getAnalyticsInstance()
        .then((analytics) => {
          if (analytics) {
            logEvent(analytics, "set_user_id", { userId });
          }
        })
        .catch(() => {});
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }
}

export function getCrashlytics(): CrashlyticsService {
  return new MobileCrashlytics();
}

export const crashlytics = getCrashlytics();
