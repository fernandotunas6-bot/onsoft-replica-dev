import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { buildGoogleWorkspaceAuthorizeUrl, scopesForServices, allowedServicesFromScopes,
  parseGrantedScopes, type WorkspaceService } from "./workspace-services";
import { randomBase64Url, sha256Base64Url, encryptWorkspaceSecret,
  decryptWorkspaceSecret } from "./workspace-crypto.server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function configuredEnv() {
  const clientId = process.env["GOOGLE_WORKSPACE_CLIENT_ID"]?.trim();
  const clientSecret = process.env["GOOGLE_WORKSPACE_CLIENT_SECRET"]?.trim();
  const redirectUri = process.env["GOOGLE_WORKSPACE_REDIRECT_URI"]?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Workspace indisponível: configure Client ID, segredo e callback no servidor.");
  }
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== "https:" &&
    !(redirect.protocol === "http:" && ["127.0.0.1", "localhost"].includes(redirect.hostname))) {
    throw new Error("O callback Google Workspace deve usar HTTPS.");
  }
  return { clientId, clientSecret, redirectUri };
}

async function activeMembership(userId: string, schoolId: string) {
  const db = await loadSgaAdminClient();
  const [membership, school] = await Promise.all([
    db.from("school_memberships").select("id").eq("user_id", userId)
      .eq("school_id", schoolId).eq("status", "active").maybeSingle(),
    db.from("schools").select("id").eq("id", schoolId).eq("status", "active").maybeSingle(),
  ]);
  if (membership.error || school.error) throw new Error("Falha na validação institucional.");
  if (!membership.data || !school.data) throw new Error("A instituição ou o vínculo não está activo.");
  return db;
}

export async function startWorkspaceConsent(input: {
  userId: string; schoolId: string; sessionId: string; services: WorkspaceService[];
}) {
  if (!input.sessionId) throw new Error("Sessão Supabase sem identificador seguro.");
  const db = await activeMembership(input.userId, input.schoolId);
  const env = configuredEnv();
  const state = randomBase64Url(32);
  const codeVerifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(codeVerifier);
  const stateDigest = await sha256Base64Url(state);
  const encryptedVerifier = await encryptWorkspaceSecret(codeVerifier);
  const { error } = await db.from("google_workspace_oauth_states").insert({
    state_hash: stateDigest, user_id: input.userId, school_id: input.schoolId,
    session_id: input.sessionId, encrypted_verifier: encryptedVerifier,
    redirect_uri: env.redirectUri,
    requested_services: input.services,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error("Não foi possível iniciar a ligação Google Workspace.");
  return {
    authorizeUrl: buildGoogleWorkspaceAuthorizeUrl({
      clientId: env.clientId, redirectUri: env.redirectUri, state,
      codeChallenge: challenge, services: input.services,
    }),
  };
}

async function exchangeGoogleToken(params: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!response.ok) throw new Error(`Google recusou a autorização (HTTP ${response.status}).`);
  const result = (await response.json()) as Record<string, unknown>;
  if (typeof result["access_token"] !== "string") throw new Error("Token de acesso Google em falta.");
  return result;
}

function formCredentials() {
  const { clientId, clientSecret } = configuredEnv();
  return { client_id: clientId, client_secret: clientSecret };
}

export async function completeWorkspaceConsent(input: {
  userId: string; sessionId: string; state: string; code: string;
}) {
  if (!input.sessionId) throw new Error("Sessão Supabase inválida.");
  const digest = await sha256Base64Url(input.state);
  const db = await loadSgaAdminClient();
  // Atomic consume: repeated callbacks cannot reuse a state or its verifier.
  const consumed = await db.from("google_workspace_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state_hash", digest).eq("user_id", input.userId)
    .eq("session_id", input.sessionId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id,school_id,session_id,encrypted_verifier,requested_services,expires_at,redirect_uri")
    .maybeSingle();
  if (consumed.error || !consumed.data) throw new Error("Autorização Google expirada ou já utilizada.");
  const transaction = consumed.data;
  if (transaction.user_id !== input.userId || transaction.session_id !== input.sessionId ||
    new Date(transaction.expires_at).getTime() < Date.now()) {
    throw new Error("Estado OAuth não pertence à sessão actual ou expirou.");
  }
  await activeMembership(input.userId, transaction.school_id);
  const env = configuredEnv();
  const codeVerifier = await decryptWorkspaceSecret(transaction.encrypted_verifier);
  const tokens = await exchangeGoogleToken(new URLSearchParams({
    ...formCredentials(), grant_type: "authorization_code",
    redirect_uri: transaction.redirect_uri, code: input.code, code_verifier: codeVerifier,
  }));
  const grantedScopes = parseGrantedScopes(tokens["scope"]);
  const expected = scopesForServices(transaction.requested_services as WorkspaceService[]);
  if (!expected.every((scope) => grantedScopes.includes(scope))) {
    throw new Error("O Google não concedeu todas as permissões solicitadas. Tente ligar apenas os serviços desejados.");
  }
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens["access_token"]}` },
  });
  if (!response.ok) throw new Error("Não foi possível confirmar o proprietário da conta Google.");
  const identity = (await response.json()) as Record<string, unknown>;
  if (typeof identity["sub"] !== "string" || typeof identity["email"] !== "string") {
    throw new Error("A identidade Google devolvida é inválida.");
  }
  const existing = await db.from("google_workspace_connections")
    .select("google_sub, encrypted_refresh_token, granted_scopes")
    .eq("user_id", input.userId).eq("school_id", transaction.school_id).maybeSingle();
  if (existing.error) throw new Error("Falha ao verificar a ligação Google existente.");
  if (existing.data && existing.data.google_sub !== identity["sub"]) {
    throw new Error("Desligue a conta Google anterior antes de ligar uma conta diferente.");
  }
  const refresh = typeof tokens["refresh_token"] === "string"
    ? await encryptWorkspaceSecret(tokens["refresh_token"])
    : existing.data?.encrypted_refresh_token;
  if (!refresh) throw new Error("O Google não devolveu autorização offline. Revogue e tente novamente.");
  // Scope union is allowed only for the same Google subject. On a new grant,
  // preserve earlier scopes solely when the response proves they were granted.
  const finalScopes = grantedScopes;
  const { error } = await db.from("google_workspace_connections").upsert({
    user_id: input.userId, school_id: transaction.school_id,
    google_sub: identity["sub"], account_email: identity["email"],
    granted_scopes: finalScopes, encrypted_refresh_token: refresh,
    encrypted_access_token: await encryptWorkspaceSecret(tokens["access_token"]),
    expires_at: new Date(Date.now() +
      (typeof tokens["expires_in"] === "number" ? tokens["expires_in"] : 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,school_id" });
  if (error) throw new Error("Não foi possível guardar a autorização Google.");
  return { connected: true, schoolId: transaction.school_id,
    googleEmail: identity["email"], services: allowedServicesFromScopes(finalScopes) };
}

export async function workspaceConnectionStatus(userId: string, schoolId: string) {
  const db = await activeMembership(userId, schoolId);
  const { data, error } = await db.from("google_workspace_connections")
    .select("account_email, granted_scopes, connected_at")
    .eq("user_id", userId).eq("school_id", schoolId).maybeSingle();
  if (error) throw new Error("Não foi possível consultar as ligações Google.");
  return {
    connected: Boolean(data),
    googleEmail: data?.account_email ?? null,
    services: allowedServicesFromScopes(data?.granted_scopes ?? []),
    connectedAt: data?.connected_at ?? null,
  };
}

export async function disconnectWorkspace(userId: string, schoolId: string) {
  const db = await activeMembership(userId, schoolId);
  const { data, error } = await db.from("google_workspace_connections")
    .delete().eq("user_id", userId).eq("school_id", schoolId)
    .select("encrypted_access_token, encrypted_refresh_token").maybeSingle();
  if (error) throw new Error("Não foi possível eliminar a ligação Google.");
  // Local revocation is authoritative. Google remote revocation is best-effort:
  // do not restore a token if Google is temporarily unreachable.
  if (data?.encrypted_access_token) {
    try {
      const token = await decryptWorkspaceSecret(data.encrypted_access_token);
      await fetch(GOOGLE_REVOKE_URL, { method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }) });
    } catch { /* The local credential is already deleted. */ }
  }
  return { disconnected: true };
}

export async function getWorkspaceAccessToken(
  userId: string, schoolId: string, service: WorkspaceService,
): Promise<string> {
  const db = await activeMembership(userId, schoolId);
  const { data: row, error } = await db.from("google_workspace_connections")
    .select("*").eq("user_id", userId).eq("school_id", schoolId).maybeSingle();
  if (error || !row) throw new Error("Ligue a sua conta Google Workspace nas definições.");
  const required = scopesForServices([service]);
  if (!required.every((scope) => (row.granted_scopes as string[]).includes(scope))) {
    throw new Error(`Autorize primeiro o serviço Google ${service}.`);
  }
  const expires = row.expires_at
    ? new Date(row.expires_at).getTime() : 0;
  if (row.encrypted_access_token && expires > Date.now() + 90_000) {
    return decryptWorkspaceSecret(row.encrypted_access_token);
  }
  const refresh = await decryptWorkspaceSecret(row.encrypted_refresh_token);
  const result = await exchangeGoogleToken(new URLSearchParams({
    ...formCredentials(), grant_type: "refresh_token", refresh_token: refresh,
  }));
  const scopeResult = parseGrantedScopes(result["scope"]);
  if (scopeResult.length && !required.every((scope) => scopeResult.includes(scope))) {
    throw new Error("O Google revogou as permissões deste serviço. Volte a autorizar.");
  }
  const fields: Record<string, unknown> = {
    encrypted_access_token: await encryptWorkspaceSecret(result["access_token"]),
    expires_at: new Date(Date.now() +
      (typeof result["expires_in"] === "number" ? result["expires_in"] : 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (typeof result["refresh_token"] === "string") {
    fields["encrypted_refresh_token"] = await encryptWorkspaceSecret(result["refresh_token"]);
  }
  if (scopeResult.length) fields["granted_scopes"] = scopeResult;
  const save = await db.from("google_workspace_connections").update(fields)
    .eq("id", row.id).eq("user_id", userId).eq("school_id", schoolId);
  if (save.error) throw new Error("Falha ao actualizar a autorização Google.");
  return result["access_token"];
}

export async function requireWorkspaceSchoolMember(userId: string, schoolId: string) {
  return activeMembership(userId, schoolId);
}
