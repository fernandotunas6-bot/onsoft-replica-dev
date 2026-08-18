import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Load .env file
const envFile = path.resolve(".env");
const envVars = {};
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val;
      }
    }
  }
}

const SUPABASE_URL =
  envVars.VITE_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://xodgfmxiaunpamctfeea.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  envVars.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvZGdmbXhpYXVucGFtY3RmZWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NjIxOTYsImV4cCI6MjEwMTMzODE5Nn0.5f5dpoKP_Yu3y4ZaWhAEDLmWpGmVDq4KtuG38kGvDIM";
const SUPABASE_SERVICE_ROLE_KEY =
  envVars.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvZGdmbXhpYXVucGFtY3RmZWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTc2MjE5NiwiZXhwIjoyMTAxMzM4MTk2fQ.YROu1hTgqtV58c_BNNQ14IiKe1B0L5h96PWvp8uGQOk";
const CLOUDFLARE_API_TOKEN =
  envVars.CLOUDFLARE_API_TOKEN ||
  process.env.CLOUDFLARE_API_TOKEN ||
  "cfut_1KGKkdaRwwHem45MmYft66Kkku6Vu5q2ZKYqvN922153ce55";
const CLOUDFLARE_ACCOUNT_ID =
  envVars.CLOUDFLARE_ACCOUNT_ID ||
  process.env.CLOUDFLARE_ACCOUNT_ID ||
  "701800d01d428c5141fa1fdb60ee01ae";

console.log("==> Building for Cloudflare (production)...");
execSync("npx vite build --mode production", {
  stdio: "inherit",
  env: {
    ...process.env,
    ...envVars,
    NODE_ENV: "production",
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY,
  },
});

const wranglerPath = path.resolve(".output/server/wrangler.json");
if (fs.existsSync(wranglerPath)) {
  const config = JSON.parse(fs.readFileSync(wranglerPath, "utf-8"));
  config.vars = {
    ...config.vars,
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY,
  };
  fs.writeFileSync(wranglerPath, JSON.stringify(config, null, 2), "utf-8");
  console.log("==> Attached production Supabase environment variables to wrangler.json");
}

console.log("==> Deploying to Cloudflare Workers...");
execSync("npx wrangler deploy --config .output/server/wrangler.json", {
  stdio: "inherit",
  env: {
    ...process.env,
    CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID,
  },
});
console.log("==> Cloudflare deployment successfully updated!");
