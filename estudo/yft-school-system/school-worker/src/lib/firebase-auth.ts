import type { Env, User } from '../app-env';
import { createPrefixedId } from './id';

type CreateUserInput = {
  email: string;
  password: string;
  displayName: string;
};

type FirebaseSignupResponse = {
  localId: string;
  email: string;
  displayName?: string;
  idToken?: string;
};

function requireWebApiKey(env: Env) {
  if (!env.FIREBASE_WEB_API_KEY) {
    throw new Error('FIREBASE_WEB_API_KEY is required for Firebase account provisioning');
  }

  return env.FIREBASE_WEB_API_KEY;
}

async function firebaseRequest<T>(env: Env, endpoint: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = requireWebApiKey(env);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const rawMsg = payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: { message?: string } }).error?.message ?? ''
      : '';
    const isEmailExists = rawMsg.includes('EMAIL_EXISTS');
    const userMessage = isEmailExists
      ? 'An account with this email already exists'
      : 'Account provisioning failed';
    console.error('Firebase Auth error:', rawMsg);
    throw new Error(userMessage);
  }

  return payload as T;
}

export async function createFirebaseEmailUser(env: Env, input: CreateUserInput) {
  const signup = await firebaseRequest<FirebaseSignupResponse>(env, 'accounts:signUp', {
    email: input.email,
    password: input.password,
    returnSecureToken: true,
  });

  if (signup.idToken && input.displayName) {
    await firebaseRequest<Record<string, unknown>>(env, 'accounts:update', {
      idToken: signup.idToken,
      displayName: input.displayName,
      returnSecureToken: false,
    });
  }

  return {
    uid: signup.localId,
    email: signup.email,
  };
}

export async function createFirebaseLinkedUser(
  env: Env,
  input: CreateUserInput,
  user: Omit<User, 'uid'> & { uid?: string }
) {
  const firebaseUser = await createFirebaseEmailUser(env, input);
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    provisionalUserId: user.uid ?? createPrefixedId('user'),
  };
}
