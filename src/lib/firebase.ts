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
  projectId: configJson.projectId || "gen-lang-client-0509105360",
  appId: configJson.appId || "1:445079520865:web:a45d9ac25a5c7b1570cc20",
  apiKey: configJson.apiKey || "AIzaSyCy6DNTJp1HRhUJpjPHor5qxkhln049cuU",
  authDomain: configJson.authDomain || "gen-lang-client-0509105360.firebaseapp.com",
  storageBucket:
    (configJson as { storageBucket?: string }).storageBucket ||
    "gen-lang-client-0509105360.firebasestorage.app",
  messagingSenderId:
    (configJson as { messagingSenderId?: string }).messagingSenderId || "445079520865",
  measurementId: (configJson as { measurementId?: string }).measurementId || "",
  oAuthClientId:
    (configJson as { oAuthClientId?: string }).oAuthClientId ||
    "445079520865-7jlrh1du2vjp1o1ro3p8o7ms2qo7e8b8.apps.googleusercontent.com",
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
 * Initialized app instance
 */
export const app: FirebaseApp = getFirebaseApp();

/**
 * Returns Firebase Analytics if supported by the runtime (browser/hybrid environment).
 */
export async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
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
