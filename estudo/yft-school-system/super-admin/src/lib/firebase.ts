import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function getConfigValue(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing Firebase client config: ${key}`);
  }

  return value;
}

export function getFirebaseApp() {
  const config = {
    apiKey: getConfigValue(firebaseConfig.apiKey, 'apiKey'),
    authDomain: getConfigValue(firebaseConfig.authDomain, 'authDomain'),
    projectId: getConfigValue(firebaseConfig.projectId, 'projectId'),
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
    measurementId: firebaseConfig.measurementId,
  };

  return getApps().length ? getApps()[0] : initializeApp(config);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}
