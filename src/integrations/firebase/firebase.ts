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
  projectId: "gen-lang-client-0509105360",
  appId: "1:445079520865:web:a45d9ac25a5c7b1570cc20",
  apiKey: "AIzaSyCy6DNTJp1HRhUJpjPHor5qxkhln049cuU",
  authDomain: "gen-lang-client-0509105360.firebaseapp.com",
  storageBucket: "gen-lang-client-0509105360.firebasestorage.app",
  messagingSenderId: "445079520865",
  measurementId: "",
  oAuthClientId: "445079520865-7jlrh1du2vjp1o1ro3p8o7ms2qo7e8b8.apps.googleusercontent.com",
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
 */
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
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
export const app = typeof window !== "undefined" ? getFirebaseApp() : null;
