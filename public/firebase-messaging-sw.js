/**
 * Firebase Cloud Messaging Service Worker for Android / Web / PWA.
 * Receives background push notifications when the app is minimized or closed.
 */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// Initialize Firebase with the SIGA Plus project configuration
firebase.initializeApp({
  apiKey: "AIzaSyCLOIqKSrOru6yTCf7uK-LI0OWZbG_QZws",
  authDomain: "siga-plus-3ba9c.firebaseapp.com",
  projectId: "siga-plus-3ba9c",
  storageBucket: "siga-plus-3ba9c.firebasestorage.app",
  messagingSenderId: "1051179373088",
  appId: "1:1051179373088:web:62ffc7fccf3ad61262e245",
  measurementId: "G-F99KXGH8CF",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.info("[FCM SW] Mensagem em segundo plano recebida:", payload);
  const notificationTitle = payload.notification?.title || payload.data?.title || "SIGA Plus";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "Nova notificação escolar",
    icon: payload.notification?.icon || "/favicon.png",
    badge: "/favicon.png",
    vibrate: [200, 100, 200],
    tag: payload.data?.tag || "siga-notification",
    data: {
      url: payload.data?.url || payload.data?.click_action || "/",
      ...payload.data,
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
