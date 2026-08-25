/**
 * Gerenciador de Notificações Push Nativas PWA (Mobile e Desktop).
 * Suporta emissão de alertas de faltas, notas lançadas e propinas a vencer.
 */

export interface SchoolNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export async function requestPushNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return "denied";
  }
}

export async function sendLocalPushNotification(
  payload: SchoolNotificationPayload,
): Promise<boolean> {
  const perm = await requestPushNotificationPermission();
  if (perm !== "granted") return false;

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || "/favicon.png",
        badge: payload.badge || "/favicon.png",
        tag: payload.tag || "siga-notice",
        data: payload.data,
      });
      return true;
    }

    new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/favicon.png",
    });
    return true;
  } catch {
    return false;
  }
}
