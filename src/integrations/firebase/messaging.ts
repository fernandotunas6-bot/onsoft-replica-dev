/**
 * Firebase Cloud Messaging (FCM) Integration
 * Supports Web, Android (PWA & Chrome) and Desktop Push Notifications.
 */
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as isFcmSupported,
  type Messaging,
  type MessagePayload,
} from "firebase/messaging";
import { getFirebaseApp } from "./firebase";
import { useState, useEffect, useCallback } from "react";

let messagingInstance: Messaging | null = null;
let messagingSupportedPromise: Promise<boolean> | null = null;

const FCM_TOKEN_STORAGE_KEY = "siga_fcm_device_token";

/**
 * Checks whether Firebase Messaging is supported in the current environment
 * (requires ServiceWorker, PushManager, and IndexedDB).
 */
export async function isFirebaseMessagingSupported(): Promise<boolean> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return false;
  }
  if (!messagingSupportedPromise) {
    messagingSupportedPromise = isFcmSupported().catch(() => false);
  }
  return messagingSupportedPromise;
}

/**
 * Initializes and returns the Firebase Messaging instance.
 * Returns null if messaging is not supported in the current environment.
 */
export async function getFirebaseMessagingInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;

  const supported = await isFirebaseMessagingSupported();
  if (!supported) return null;

  try {
    const app = getFirebaseApp();
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (error) {
    console.warn("[FCM] Erro ao inicializar Firebase Messaging:", error);
    return null;
  }
}

/**
 * Requests push notification permissions from the user.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn("[FCM] Erro ao solicitar permissão de notificação:", err);
    return "denied";
  }
}

export interface GetFcmTokenOptions {
  vapidKey?: string;
  serviceWorkerRegistration?: ServiceWorkerRegistration;
}

/**
 * Obtains the unique FCM Device Token for Web & Android PWA.
 * This token should be sent to your server/database to dispatch targeted notifications.
 */
export async function getFcmToken(options?: GetFcmTokenOptions): Promise<string | null> {
  const supported = await isFirebaseMessagingSupported();
  if (!supported) return null;

  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    console.info("[FCM] Permissão de notificação não concedida:", permission);
    return null;
  }

  const messaging = await getFirebaseMessagingInstance();
  if (!messaging) return null;

  try {
    let swRegistration = options?.serviceWorkerRegistration;
    if (!swRegistration && "serviceWorker" in navigator) {
      swRegistration = await navigator.serviceWorker.ready;
    }

    const vapidKey =
      options?.vapidKey ||
      (typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_VAPID_KEY : undefined);

    const token = await getToken(messaging, {
      vapidKey: vapidKey || undefined,
      serviceWorkerRegistration: swRegistration,
    });

    if (token) {
      try {
        localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
      } catch {
        // Ignora caso storage esteja restrito
      }
      return token;
    }
    return null;
  } catch (error) {
    console.warn("[FCM] Erro ao obter token FCM:", error);
    return null;
  }
}

/**
 * Returns the currently cached FCM device token if available.
 */
export function getCachedFcmToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Listens for messages received while the application is in foreground.
 */
export function onFirebaseMessage(callback: (payload: MessagePayload) => void): () => void {
  let unsubscribe: (() => void) | null = null;

  getFirebaseMessagingInstance().then((messaging) => {
    if (messaging) {
      unsubscribe = onMessage(messaging, (payload) => {
        callback(payload);
      });
    }
  });

  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}

/**
 * React Hook for managing FCM Notifications state and permissions.
 */
export function useFirebaseNotifications(options?: GetFcmTokenOptions) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [token, setToken] = useState<string | null>(getCachedFcmToken());
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    isFirebaseMessagingSupported().then((supported) => {
      setIsSupported(supported);
      if (typeof window !== "undefined" && "Notification" in window) {
        setPermission(Notification.permission);
      }
    });
  }, []);

  const enableNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm === "granted") {
        const deviceToken = await getFcmToken(options);
        setToken(deviceToken);
        return deviceToken;
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  return {
    isSupported,
    permission,
    token,
    isLoading,
    enableNotifications,
  };
}
