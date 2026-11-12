#!/usr/bin/env node
/** Read-only release inventory. Never checks out, merges, commits, pushes or reads secrets. */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function git(root, args, allowed = [0]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!allowed.includes(result.status)) throw new Error(`Git inventory failed: ${args[0]}`);
  return { status: result.status, output: result.stdout };
}
const lines = (value) => value.trim().split("\n").filter(Boolean);
const paths = (value) => value.split("\0").filter(Boolean);
const domains = (files) =>
  [
    ...new Set(
      files.map((file) => {
        if (file.startsWith("supabase/") || file.endsWith(".sql")) return "database";
        if (/^(src\/(features\/auth|lib\/auth|lib\/saas)|src\/integrations\/supabase)/.test(file))
          return "identity-security";
        if (/^(painel\/payflow|src\/features\/(financeiro|saas))/.test(file))
          return "billing-finance";
        if (file.startsWith("painel/")) return file.split("/").slice(0, 2).join("/");
        if (file.startsWith("mobile-flutter/")) return "mobile-flutter";
        if (file.startsWith("estudo/")) return "study-yft";
        if (file.startsWith("desktop/")) return "desktop";
        if (file.startsWith(".github/") || file.startsWith("scripts/")) return "delivery-tooling";
        if (file.startsWith("docs/") || file.endsWith(".md")) return "documentation";
        return file.split("/")[0];
      }),
    ),
  ].sort();

export function inventoryRepository({ root, base = "origin/main", prs = [] }) {
  root = resolve(root);
  if (git(root, ["rev-parse", "--is-shallow-repository"]).output.trim() === "true")
    throw new Error(
      "Full history is required: fetch --unshallow before analysing branch inclusion or conflicts.",
    );
  const baseSha = git(root, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${base}^{commit}`,
  ]).output.trim();
  const refs = lines(
    git(root, [
      "for-each-ref",
      "--format=%(refname)%00%(objectname)%00%(symref)",
      "refs/remotes/origin/",
    ]).output,
  )
    .map((row) => row.split("\0"))
    .filter(([, , symbolic]) => !symbolic);
  const branches = refs.map(([ref, sha]) => {
    const name = ref.replace("refs/remotes/origin/", "");
    const relatedPrs = prs.filter((pr) => pr.headRefName === name);
    const included = git(root, ["merge-base", "--is-ancestor", sha, baseSha], [0, 1]).status === 0;
    const commonHistory = git(root, ["merge-base", baseSha, sha], [0, 1]).status === 0;
    const [behind, ahead] = git(root, [
      "rev-list",
      "--left-right",
      "--count",
      `${baseSha}...${sha}`,
    ])
      .output.trim()
      .split(/\s+/)
      .map(Number);
    const changedFiles =
      included || !commonHistory
        ? []
        : paths(
            git(root, ["diff", "--no-renames", "--name-only", "-z", `${baseSha}...${sha}`]).output,
          );
    const commits = included
      ? []
      : lines(
          git(root, ["log", "--format=%H%x09%an%x09%cs%x09%s", `${baseSha}..${sha}`]).output,
        ).map((row) => {
          const [commit, author, date, ...subject] = row.split("\t");
          return { sha: commit, author, date, subject: subject.join("\t") };
        });
    const cherry =
      included || !commonHistory ? [] : lines(git(root, ["cherry", baseSha, sha]).output);
    const mergeCommits = included
      ? 0
      : Number(git(root, ["rev-list", "--count", "--merges", `${baseSha}..${sha}`]).output.trim());
    const merge =
      included || !commonHistory
        ? null
        : git(
            root,
            ["merge-tree", "--write-tree", "--name-only", "--no-messages", "-z", baseSha, sha],
            [0, 1],
          );
    const conflicts = merge?.status === 1 ? paths(merge.output).slice(1) : [];
    return {
      name,
      sha,
      includedByHistory: included,
      commonHistory,
      behind,
      ahead,
      claudeBranch: name.startsWith("claude/"),
      pullRequests: relatedPrs.map((pr) => pr.number),
      headMatchesPr: relatedPrs.every((pr) => pr.headRefOid === sha),
      patchUniqueCommits: cherry.filter((row) => row.startsWith("+ ")).length,
      patchEquivalentCommits: cherry.filter((row) => row.startsWith("- ")).length,
      mergeCommits,
      changedFiles,
      domains: domains(changedFiles),
      commits,
      mergeToBase: included
        ? "already-included"
        : !commonHistory
          ? "unrelated-history"
          : merge.status === 0
            ? "clean-tree-only"
            : "conflicts",
      conflicts,
    };
  });
  const pending = branches.filter((branch) => !branch.includedByHistory);
  const overlap = [];
  for (let i = 0; i < pending.length; i++) {
    const left = pending[i];
    const files = new Set(left.changedFiles);
    for (const right of pending.slice(i + 1)) {
      const shared = right.changedFiles.filter((file) => files.has(file));
      if (shared.length)
        overlap.push({
          left: left.name,
          right: right.name,
          sameHead: left.sha === right.sha,
          files: shared,
        });
    }
  }
  overlap.sort((a, b) => b.files.length - a.files.length || a.left.localeCompare(b.left));
  const localBranches = lines(
    git(root, ["for-each-ref", "--format=%(refname:short)%00%(objectname)", "refs/heads/"]).output,
  ).map((row) => {
    const [name, sha] = row.split("\0");
    return {
      name,
      sha,
      includedByHistory:
        git(root, ["merge-base", "--is-ancestor", sha, baseSha], [0, 1]).status === 0,
    };
  });
  const worktrees = git(root, ["worktree", "list", "--porcelain"])
    .output.trim()
    .split("\n\n")
    .map((block) => {
      const data = Object.fromEntries(
        lines(block).map((row) => {
          const index = row.indexOf(" ");
          return [row.slice(0, index), row.slice(index + 1)];
        }),
      );
      return {
        path: data.worktree,
        sha: data.HEAD,
        branch: data.branch ?? null,
        status: paths(git(data.worktree, ["status", "--porcelain=v1", "-z"]).output),
      };
    });
  const pullRequests = prs.map((pr) => ({
    ...pr,
    headCapturedMatchesSha: branches.some(
      (branch) => branch.name === pr.headRefName && branch.sha === pr.headRefOid,
    ),
    dependsOn: prs
      .filter((other) => other.headRefName === pr.baseRefName)
      .map((other) => other.number),
  }));
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    base,
    baseSha,
    interpretation:
      "A clean merge tree and green CI are not release approval. Changed paths are branch deltas, not proof of unique functionality. No SQL or deployment is performed.",
    summary: {
      remoteBranches: branches.length,
      includedBranches: branches.length - pending.length,
      pendingBranches: pending.length,
      branchesWithConflicts: pending.filter((branch) => branch.conflicts.length).length,
      unrelatedBranches: pending.filter((branch) => !branch.commonHistory).length,
      pendingWithoutOpenPr: pending.filter((branch) => !branch.pullRequests.length).length,
      withoutUniqueNonMergePatch: pending.filter((branch) => branch.patchUniqueCommits === 0)
        .length,
      prsWithUncapturedHead: pullRequests.filter((pr) => !pr.headCapturedMatchesSha).length,
      claudeBranches: branches.filter((branch) => branch.claudeBranch).length,
      openPrs: prs.length,
      draftPrs: prs.filter((pr) => pr.isDraft).length,
      worktrees: worktrees.length,
      dirtyWorktrees: worktrees.filter((tree) => tree.status.length).length,
    },
    branches,
    localBranches,
    worktrees,
    pullRequests,
    overlap,
  };
}

const cell = (value) =>
  String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .replaceAll("`", "'");
export function inventoryMarkdown(data) {
  const branchRows = data.branches
    .filter((branch) => !branch.includedByHistory)
    .map((branch) => {
      const prs =
        branch.pullRequests
          .map((number) => {
            const pr = data.pullRequests.find((item) => item.number === number);
            return `[#${number}](${pr.url})${pr.isDraft ? " rascunho" : ""}${pr.ciState ? ` · CI ${cell(pr.ciState)}` : " · CI sem resultado"}${pr.headCapturedMatchesSha ? "" : " · RECENTRAR HEAD"}`;
          })
          .join("; ") || "Sem PR aberto";
      return `| ${cell(branch.name)} | \`${branch.sha.slice(0, 12)}\` | ${prs} | ${branch.patchUniqueCommits} / ${branch.patchEquivalentCommits} | ${!branch.commonHistory ? "Sem ancestral comum" : branch.conflicts.length || "Fusão limpa¹"} | ${cell(branch.domains.join(", "))} |`;
    });
  return (
    `# Inventário para a consolidação de produção\n\nCapturado em ${data.capturedAt}. Base fixa: \`${data.baseSha}\` (${cell(data.base)}).\n\n` +
    `- ${data.summary.remoteBranches} branches remotas; ${data.summary.includedBranches} já incluídas por histórico; ${data.summary.pendingBranches} com cabeçalho fora do histórico da base. Isto não significa o mesmo número de funcionalidades novas.\n` +
    `- ${data.summary.openPrs} PRs abertos, ${data.summary.draftPrs} em rascunho; ${data.summary.claudeBranches} branches com prefixo Claude.\n` +
    `- ${data.summary.branchesWithConflicts} branches com conflitos contra a base; ${data.summary.pendingWithoutOpenPr} pendentes sem PR aberto.\n` +
    `- ${data.summary.worktrees} worktrees locais, ${data.summary.dirtyWorktrees} com alterações por guardar no momento da captura.\n\n` +
    `- ${data.summary.withoutUniqueNonMergePatch} branches sem patch novo de commit não-merge; as resoluções de merge ainda exigem revisão. ${data.summary.prsWithUncapturedHead} PRs sem o mesmo cabeçalho capturado.\n\n` +
    `## Branches pendentes\n\n| Branch | Commit capturado | PR / CI | Commits únicos / equivalentes por patch | Conflitos | Áreas |\n| --- | --- | --- | --- | --- | --- |\n${branchRows.join("\n")}\n\n` +
    `¹ Fusão limpa verifica apenas a árvore Git. Não comprova compatibilidade funcional, SQL aplicado, segurança ou prontidão de produção. A equivalência de patches não autoriza apagar trabalho nem ignorar resoluções de merge.\n\n` +
    `## Trabalho Claude\n\n${data.branches
      .filter((branch) => branch.claudeBranch)
      .map(
        (branch) =>
          `- ${cell(branch.name)} · \`${branch.sha}\` · ${branch.includedByHistory ? "já incluída por histórico" : `rever ${branch.patchUniqueCommits} patches sem equivalência exacta e ${branch.mergeCommits} merges; ${branch.conflicts.length} conflitos com a base`}.`,
      )
      .join("\n")}\n\n` +
    `## Dependências entre PRs\n\n${
      data.pullRequests
        .filter((pr) => pr.dependsOn.length)
        .map(
          (pr) =>
            `- #${pr.number} parte de ${cell(pr.baseRefName)} e depende de ${pr.dependsOn.map((n) => "#" + n).join(", ")}.`,
        )
        .join("\n") || "Nenhuma dependência por branch-base identificada."
    }\n\n` +
    `## Maiores sobreposições de ficheiros\n\nSobreposição indica revisão conjunta; não é, por si só, conflito textual ou duplicação. Os caminhos completos estão no JSON.\n\n| Branch A | Branch B | Ficheiros comuns | Mesmo commit |\n| --- | --- | --- | --- |\n` +
    data.overlap
      .slice(0, 20)
      .map(
        (pair) =>
          `| ${cell(pair.left)} | ${cell(pair.right)} | ${pair.files.length} | ${pair.sameHead ? "Sim" : "Não"} |`,
      )
      .join("\n") +
    `\n\n## Alterações locais\n\n${data.worktrees.map((tree) => `- ${cell(tree.path)} · \`${tree.sha.slice(0, 12)}\` · ${tree.status.length ? tree.status.map(cell).join("; ") : "limpa"}`).join("\n")}\n\n` +
    `Os hashes completos, autores dos commits pendentes, paths de conflito, estados de CI e todas as sobreposições ficam no JSON correspondente. Este inventário não altera branches, PRs, bases de dados ou serviços publicados. Deve ser regenerado antes de fechar a versão, porque outros agentes podem continuar a trabalhar.\n`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    if (
      !["--root", "--base", "--prs", "--json", "--markdown"].includes(key) ||
      !process.argv[index + 1]
    )
      throw new Error("Use --root, --base, --prs, --json, --markdown with explicit values.");
    options[key.slice(2)] = process.argv[index + 1];
  }
  const prs = options.prs ? JSON.parse(readFileSync(options.prs, "utf8")) : [];
  if (!Array.isArray(prs)) throw new Error("PR metadata must be an array.");
  const data = inventoryRepository({
    root: options.root ?? process.cwd(),
    base: options.base,
    prs,
  });
  if (options.json) writeFileSync(options.json, JSON.stringify(data, null, 2) + "\n");
  if (options.markdown) writeFileSync(options.markdown, inventoryMarkdown(data));
  console.log(JSON.stringify({ baseSha: data.baseSha, ...data.summary }, null, 2));
}
