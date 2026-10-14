#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const result = {};
  const content = readFileSync(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const cleaned = line.startsWith('export ') ? line.slice(7) : line;
    const equalsIndex = cleaned.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = cleaned.slice(0, equalsIndex).trim();
    let value = cleaned.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadFallbackEnv() {
  return {
    ...parseEnvFile(path.join(repoRoot, 'super-admin', '.env.local')),
    ...parseEnvFile(path.join(repoRoot, 'school-worker', '.dev.vars')),
  };
}

function getEnv(name, fallbackEnv) {
  return process.env[name] ?? fallbackEnv[name];
}

function formatMaybe(value) {
  return value ? value : '<missing>';
}

function prompt(question, { hidden = false, defaultValue = '' } = {}) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const finalize = (value) => {
      rl.close();
      resolve(value);
    };

    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('Cancelled'));
    });

    if (!hidden) {
      rl.question(question, (answer) => {
        finalize(answer.trim() || defaultValue);
      });
      return;
    }

    rl.stdoutMuted = true;
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (rl.stdoutMuted) {
        rl.output.write('*');
      } else {
        rl.output.write(stringToWrite);
      }
    };

    rl.question(question, (answer) => {
      finalize(answer);
    });
  });
}

function findServiceAccountFile() {
  // Look for any Firebase Admin SDK service account JSON in the repo root
  const files = readdirSync(repoRoot).filter(
    (f) => f.endsWith('.json') && f.includes('firebase-adminsdk')
  );
  return files.length > 0 ? path.join(repoRoot, files[0]) : null;
}

function readServiceAccount() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ??
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ??
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const bundledKeyPath = findServiceAccountFile();
  if (!raw && bundledKeyPath && existsSync(bundledKeyPath)) {
    const fileContent = readFileSync(bundledKeyPath, 'utf8');
    return JSON.parse(fileContent);
  }

  if (!raw) {
    return null;
  }

  if (raw.trim().startsWith('{')) {
    return JSON.parse(raw);
  }

  const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  const fileContent = readFileSync(filePath, 'utf8');
  return JSON.parse(fileContent);
}

function toServiceAccountCredentials(json) {
  const projectId = json.project_id ?? json.projectId;
  const clientEmail = json.client_email ?? json.clientEmail;
  const privateKey = json.private_key ?? json.privateKey;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Service account JSON must include project_id, client_email, and private_key'
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: String(privateKey).replace(/\\n/g, '\n'),
  };
}

async function initFirebaseAdmin() {
  const serviceAccountJson = readServiceAccount();

  if (getApps().length === 0) {
    if (serviceAccountJson) {
      const serviceAccount = toServiceAccountCredentials(serviceAccountJson);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
  }

  return getAuth();
}

async function verifyWorker(baseUrl, apiKey) {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const healthResponse = await fetch(`${normalizedBase}/health`);

  if (!healthResponse.ok) {
    throw new Error(`Worker health check failed: ${healthResponse.status} ${healthResponse.statusText}`);
  }

  const metricsResponse = await fetch(`${normalizedBase}/api/super-admin/metrics`, {
    headers: {
      'X-Super-Admin-Key': apiKey,
      Accept: 'application/json',
    },
  });

  const payload = await metricsResponse.json().catch(() => null);
  if (!metricsResponse.ok) {
    const detail =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `${metricsResponse.status} ${metricsResponse.statusText}`;
    throw new Error(`Worker admin check failed: ${detail}`);
  }

  return payload;
}

async function main() {
  const fallbackEnv = loadFallbackEnv();
  const projectId = getEnv('FIREBASE_PROJECT_ID', fallbackEnv);
  const workerUrl = getEnv('WORKER_API_URL', fallbackEnv) ?? getEnv('NEXT_PUBLIC_WORKER_API_URL', fallbackEnv);
  const superAdminKey = getEnv('SUPER_ADMIN_API_KEY', fallbackEnv);

  console.log('Super Admin Bootstrap');
  console.log(`Firebase project: ${formatMaybe(projectId)}`);
  console.log(`Worker URL: ${formatMaybe(workerUrl)}`);
  console.log(`Super admin key: ${superAdminKey ? 'present' : '<missing>'}`);
  console.log('');

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID is missing');
  }

  if (!workerUrl) {
    throw new Error('WORKER_API_URL is missing');
  }

  if (!superAdminKey) {
    throw new Error('SUPER_ADMIN_API_KEY is missing');
  }

  if (!readServiceAccount()) {
    console.log(
      [
        'No service account JSON found.',
        'Using Google Application Default Credentials if available.',
        'If this is your first time, run: gcloud auth application-default login',
      ].join('\n')
    );
  }

  const emailInput = await prompt('Super admin email: ');
  const email = emailInput.trim().toLowerCase();
  if (!email) {
    throw new Error('Email is required');
  }

  const displayNameInput = await prompt('Display name [YFT Super Admin]: ', {
    defaultValue: 'YFT Super Admin',
  });
  const displayName = displayNameInput.trim() || 'YFT Super Admin';

  let password = '';
  while (!password) {
    const first = await prompt('Password: ', { hidden: true });
    const second = await prompt('Confirm password: ', { hidden: true });
    if (first !== second) {
      console.log('\nPasswords did not match. Please try again.\n');
      continue;
    }

    if (first.length < 8) {
      console.log('\nPassword should be at least 8 characters. Please try again.\n');
      continue;
    }

    password = first;
  }

  console.log('\nChecking worker health...');
  const metrics = await verifyWorker(workerUrl, superAdminKey);
  console.log('Worker is reachable and super-admin auth is working.');
  console.log(`Current metrics: ${JSON.stringify(metrics)}`);

  const auth = await initFirebaseAdmin();
  let userRecord;
  let action = 'created';

  try {
    userRecord = await auth.getUserByEmail(email);
    action = 'updated';
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') {
      throw error;
    }
  }

  if (userRecord) {
    await auth.updateUser(userRecord.uid, {
      password,
      displayName,
      emailVerified: true,
    });
  } else {
    userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
  }

  await auth.setCustomUserClaims(userRecord.uid, {
    super_admin: true,
    role: 'super_admin',
  });

  const refreshedUser = await auth.getUser(userRecord.uid);
  const customClaims = refreshedUser.customClaims ?? {};

  if (customClaims.super_admin !== true && customClaims.role !== 'super_admin') {
    throw new Error('Failed to confirm super admin custom claims');
  }

  console.log('\nFirebase Auth setup complete.');
  console.log(`Firebase user ${action}: ${refreshedUser.uid}`);
  console.log(`Email: ${refreshedUser.email}`);
  console.log('Custom claims: { super_admin: true, role: "super_admin" }');

  // New Step: Seed D1 Database
  console.log('\nUpdating SuperAdmins record in remote D1...');
  try {
    const { execSync } = await import('node:child_process');
    const dbName = 'school_management_db';
    const sql = `INSERT INTO SuperAdmins (uid, name, email) VALUES ('${refreshedUser.uid}', '${displayName}', '${refreshedUser.email}') ON CONFLICT(uid) DO UPDATE SET name = excluded.name, email = excluded.email;`;
    
    // We try to run this against --remote by default since the user wants it in Cloudflare
    console.log(`Running: wrangler d1 execute ${dbName} --remote --command="..."`);
    
    execSync(`npx wrangler d1 execute ${dbName} --remote --command "${sql}"`, {
      cwd: path.resolve(repoRoot, 'school-worker'),
      stdio: 'inherit',
    });
    
    console.log('Successfully updated SuperAdmins table in remote D1.');
  } catch (error) {
    console.warn('\nWarning: Failed to update D1 record via wrangler.');
    console.warn('Make sure you have run migrations first: npx wrangler d1 migrations apply school_management_db --remote');
    console.warn(`Error: ${error.message}`);
  }

  console.log('\nBootstrap complete.');
  console.log('\nYou can now log in at /login in the super-admin portal using this email and password.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nBootstrap failed: ${message}`);
  process.exitCode = 1;
});
