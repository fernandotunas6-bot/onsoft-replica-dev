export interface Env {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_WEB_API_KEY?: string;
  /** Optional; enables Firebase Auth user delete when removing a parent from D1. */
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  SUPER_ADMIN_API_KEY?: string;
}

export interface User {
  uid: string;
  schoolId: string; // 'global' for super admins
  role: 'super_admin' | 'admin' | 'teacher' | 'parent';
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: User;
  };
};
