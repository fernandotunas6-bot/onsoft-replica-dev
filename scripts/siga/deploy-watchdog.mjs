#!/usr/bin/env node
/**
 * Vigilância do deploy contínuo (`.github/workflows/deploy-watchdog.yml`).
 *
 * A publicação corre a cada push para a `main` (deploy-production.yml). Quando falhava,
 * nada a repetia e ninguém era avisado: a 29–30/10 a produção ficou mais de 12 horas
 * atrás da `main` por causa de um token recusado e de segredos em falta. Aqui:
 *
 *  · compara a versão no ar (cabeçalho `x-siga-release` do SIGA) com a `main`;
 *  · se a última publicação falhou na parte de publicar, volta a correr só os jobs que
 *    falharam (os testes desse commit já passaram), uma vez por verificação agendada;
 *    testes falhados não se repetem: são um problema do código, não do caminho;
 *  · mantém uma issue «Deploy de produção parado» com o passo que falhou e o que
 *    corrigir, e fecha-a quando a produção apanhar a `main`.
 *
 * Não usa segredos de produção e não publica nada por si: só relança a publicação que
 * já existe, com as mesmas verificações e o mesmo ambiente.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DEPLOY_WORKFLOW = "deploy-production.yml";
export const ISSUE_LABEL = "deploy-parado";
export const ISSUE_TITLE = "Deploy de produção parado";
/** Uma nova tentativa só depois de a anterior ter acabado há este tempo. */
export const RETRY_AFTER_MS = 90 * 60 * 1000;
/** A partir daqui, em vez de mais uma tentativa da mesma execução, uma execução nova. */
export const MAX_ATTEMPTS_PER_RUN = 10;

/** Caminhos que a publicação ignora (paths-ignore em deploy-production.yml). */
export function isDeployIgnoredPath(file) {
  return file.startsWith("docs/") || file.endsWith(".md");
}

/** `x-siga-release` válido (SHA de 40, opcionalmente `-dirty`), ou null. */
export function parseRelease(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  const match = /^([0-9a-f]{40})(-dirty)?$/.exec(text);
  return match ? { sha: match[1], dirty: Boolean(match[2]) } : null;
}

/**
 * A produção está em dia se corre a `main`, ou um commit cuja diferença para a `main`
 * só toca no que a publicação ignora. Um deploy manual com alterações por gravar
 * (`-dirty`) nunca conta como em dia.
 */
export function isInSync({ release, mainSha, changedFiles }) {
  if (!release || release.dirty) return false;
  if (release.sha === mainSha) return true;
  return Array.isArray(changedFiles) && changedFiles.every(isDeployIgnoredPath);
}

/** O que dizer a quem lê a issue, conforme o passo que falhou. */
export function failureHint(job, step) {
  if (job === "Verificar antes de publicar") {
    return "Os testes, os tipos ou o lint falharam neste commit da `main`. É preciso corrigir o código; a vigilância não repete verificações que falharam.";
  }
  if (/Confirmar segredos/i.test(step ?? "")) {
    return "Faltam segredos no GitHub. Em Settings → Secrets and variables → Actions (ou Environments → production) têm de existir `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `SUPABASE_SERVICE_ROLE_KEY`. O log do passo diz quais faltam.";
  }
  if (/token da Cloudflare/i.test(step ?? "")) {
    return "A Cloudflare recusa o `CLOUDFLARE_API_TOKEN` (revogado, expirado, colado com espaços ou sem acesso à conta). Crie um API Token novo em Cloudflare → My Profile → API Tokens e guarde-o no GitHub. O log do passo diz o motivo exacto.";
  }
  if (/servi[çc]os publicados respondem/i.test(step ?? "")) {
    return "A publicação terminou, mas o SIGA ou o PayFlow não respondem. Ver o health do PayFlow e os logs do Worker na Cloudflare.";
  }
  if (/DNS/i.test(step ?? "")) {
    return "A publicação terminou, mas o DNS da plataforma não confere. Ver o passo «Confirmar DNS» e a zona na Cloudflare.";
  }
  return "A publicação falhou neste passo; ver o log. A vigilância volta a tentar sozinha.";
}

/**
 * Decide o que fazer. `run` é a última execução da publicação na `main` (ou null);
 * `failedJob`/`failedStep` vêm dos jobs dessa execução.
 */
export function decide({ inSync, run, mainSha, event, now, failedJob }) {
  if (inSync) return { state: "ok", retry: null };
  if (!run) return { state: "parado", retry: event === "workflow_run" ? null : "dispatch" };
  if (run.status !== "completed") return { state: "a-publicar", retry: null };
  if (run.conclusion === "success") {
    // A última publicação passou mas a produção não corre a `main`: há commits de código
    // sem publicação (ou a produção foi mudada à mão). Pede-se uma nova.
    const behind = run.head_sha !== mainSha;
    return { state: "parado", retry: behind && event !== "workflow_run" ? "dispatch" : null };
  }
  // Falhou. Verificações falhadas são do código: não se repetem.
  if (failedJob === "Verificar antes de publicar") return { state: "parado", retry: null };
  // A notificação do fim de uma publicação só actualiza a issue; repetir aqui faria um
  // ciclo (a repetição termina, notifica, repete…).
  if (event === "workflow_run") return { state: "parado", retry: null };
  if (run.head_sha !== mainSha) return { state: "parado", retry: "dispatch" };
  const finishedAt = Date.parse(run.updated_at ?? "");
  const waited = Number.isFinite(finishedAt) ? now - finishedAt : Infinity;
  if (event !== "workflow_dispatch" && waited < RETRY_AFTER_MS) {
    return { state: "parado", retry: null };
  }
  const attempts = Number(run.run_attempt ?? 1);
  return { state: "parado", retry: attempts >= MAX_ATTEMPTS_PER_RUN ? "dispatch" : "rerun" };
}

export function issueBody({ mainSha, release, run, failedJob, failedStep, retry, checkedAt }) {
  const short = (sha) => (sha ? `\`${sha.slice(0, 12)}\`` : "desconhecida");
  const lines = [
    "A produção não está a correr a versão da `main`. Esta issue é mantida pela vigilância do deploy (`.github/workflows/deploy-watchdog.yml`) e fecha-se sozinha quando a produção a apanhar.",
    "",
    `| | |`,
    `|---|---|`,
    `| \`main\` | ${short(mainSha)} |`,
    `| Versão no ar (x-siga-release) | ${release ? short(release.sha) + (release.dirty ? " (com alterações por gravar)" : "") : "sem cabeçalho (publicação anterior a 30/10)"} |`,
    `| Última publicação | ${run ? `[#${run.run_number} · tentativa ${run.run_attempt}](${run.html_url}) — ${run.status === "completed" ? run.conclusion : run.status}` : "nenhuma"} |`,
  ];
  if (failedJob) lines.push(`| Falhou em | ${failedJob} → ${failedStep || "?"} |`);
  lines.push(`| Verificado | ${checkedAt} |`);
  lines.push("");
  const hint =
    !failedJob && run?.conclusion === "success"
      ? "A última publicação passou, mas o SIGA no ar não é desta versão (publicação só de algumas apps, ou alteração feita à mão). Corra «Deploy produção» com `apps` = `all`."
      : failureHint(failedJob, failedStep);
  lines.push(`**O que fazer:** ${hint}`);
  lines.push("");
  const action =
    retry === "rerun"
      ? "Voltei a correr os jobs que falharam."
      : retry === "dispatch"
        ? "Pedi uma publicação nova da `main`."
        : "Nada a repetir agora; volto a verificar dentro de 2 horas.";
  lines.push(`**Nesta verificação:** ${action}`);
  lines.push("");
  lines.push(
    "Outras vias de publicação (escolher apps, publicar à mão sem token): `docs/releases/DEPLOY_VIAS.md`.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------- I/O (só no Actions)

/**
 * REST do GitHub pelo `gh` (no Actions usa GH_TOKEN; numa sessão local, a do `gh`).
 * Só a criação da etiqueta tolera 422 (já existe).
 */
function github(path, { method = "GET", body } = {}) {
  const args = ["api", "-X", method, "-H", "Accept: application/vnd.github+json", path];
  if (body) args.push("--input", "-");
  try {
    const out = execFileSync("gh", args, {
      encoding: "utf8",
      input: body ? JSON.stringify(body) : undefined,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim() ? JSON.parse(out) : null;
  } catch (error) {
    const detail = `${error.stderr ?? ""}${error.stdout ?? ""}`;
    if (method === "POST" && path.endsWith("/labels") && /HTTP 422|already_exists/.test(detail)) {
      return null;
    }
    throw new Error(`GitHub ${method} ${path}: ${detail.trim() || error.message}`);
  }
}

async function readRelease(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      return parseRelease(response.headers.get("x-siga-release"));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
  return null;
}

function changedFilesBetween(from, to) {
  try {
    return execFileSync("git", ["diff", "--name-only", from, to], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return null; // commit desconhecido neste clone: não se pode dizer que está em dia
  }
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const event = process.env.EVENT || "workflow_dispatch";
  if (!repo || !process.env.GH_TOKEN)
    throw new Error("GITHUB_REPOSITORY e GH_TOKEN são obrigatórios.");

  const mainSha = github(`/repos/${repo}/commits/main`).sha;
  const release = await readRelease(process.env.SIGA_RELEASE_URL || "https://portal-siga.com/");
  const runs = github(
    `/repos/${repo}/actions/workflows/${DEPLOY_WORKFLOW}/runs?branch=main&per_page=1`,
  );
  const run = runs?.workflow_runs?.[0] ?? null;

  let failedJob = null;
  let failedStep = null;
  if (run && run.status === "completed" && run.conclusion !== "success") {
    const jobs = github(`/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest`);
    const job = jobs?.jobs?.find((j) => j.conclusion === "failure");
    failedJob = job?.name ?? null;
    failedStep = job?.steps?.find((s) => s.conclusion === "failure")?.name ?? null;
  }

  const changedFiles = release && !release.dirty ? changedFilesBetween(release.sha, mainSha) : null;
  // Sem cabeçalho (publicações anteriores a esta vigilância): vale a última publicação.
  const inSync = release
    ? isInSync({ release, mainSha, changedFiles })
    : Boolean(
        run &&
        run.status === "completed" &&
        run.conclusion === "success" &&
        (run.head_sha === mainSha ||
          (changedFilesBetween(run.head_sha, mainSha) ?? ["?"]).every(isDeployIgnoredPath)),
      );

  const decision = decide({ inSync, run, mainSha, event, now: Date.now(), failedJob });
  console.log(
    JSON.stringify({
      event,
      mainSha,
      release,
      run: run && {
        id: run.id,
        status: run.status,
        conclusion: run.conclusion,
        attempt: run.run_attempt,
      },
      failedJob,
      failedStep,
      decision,
    }),
  );

  // Ensaio: só lê e mostra a decisão (para testar fora do Actions sem mexer em nada).
  if (process.env.DEPLOY_WATCHDOG_DRY_RUN === "1") return;

  if (decision.retry === "rerun") {
    github(`/repos/${repo}/actions/runs/${run.id}/rerun-failed-jobs`, { method: "POST" });
  } else if (decision.retry === "dispatch") {
    github(`/repos/${repo}/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`, {
      method: "POST",
      body: { ref: "main" },
    });
  }

  const open = github(`/repos/${repo}/issues?labels=${ISSUE_LABEL}&state=open&per_page=5`);
  const existing = (open ?? []).find((issue) => !issue.pull_request);

  if (decision.state === "ok") {
    if (existing) {
      github(`/repos/${repo}/issues/${existing.number}/comments`, {
        method: "POST",
        body: { body: `A produção já corre a \`main\` (${mainSha.slice(0, 12)}). A fechar.` },
      });
      github(`/repos/${repo}/issues/${existing.number}`, {
        method: "PATCH",
        body: { state: "closed", state_reason: "completed" },
      });
    }
    return;
  }
  if (decision.state === "a-publicar") return; // a publicação em curso decide

  const body = issueBody({
    mainSha,
    release,
    run,
    failedJob,
    failedStep,
    retry: decision.retry,
    checkedAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
  });
  if (existing) {
    github(`/repos/${repo}/issues/${existing.number}`, { method: "PATCH", body: { body } });
  } else {
    github(`/repos/${repo}/labels`, {
      method: "POST",
      body: { name: ISSUE_LABEL, color: "B60205", description: "A produção não corre a main" },
    });
    github(`/repos/${repo}/issues`, {
      method: "POST",
      body: { title: ISSUE_TITLE, body, labels: [ISSUE_LABEL] },
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
