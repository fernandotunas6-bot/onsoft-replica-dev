import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
// @ts-expect-error Release tooling intentionally uses executable JavaScript modules.
import { inventoryMarkdown, inventoryRepository } from "../../scripts/siga/release-inventory.mjs";

const temporary: string[] = [];
afterEach(() =>
  temporary.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
);

it("inventaria commits, conflitos e PRs sem mudar branches ou alterações locais", () => {
  const root = mkdtempSync(join(tmpdir(), "siga-release-inventory-"));
  temporary.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Release fixture");
  git("config", "user.email", "release@example.invalid");
  const commit = (name: string, value: string) => {
    writeFileSync(join(root, name), value);
    git("add", name);
    git("commit", "-m", value);
    return git("rev-parse", "HEAD");
  };
  const initial = commit("shared.txt", "initial");
  git("checkout", "-b", "claude/conflict");
  const conflict = commit("shared.txt", "Claude work");
  git("update-ref", "refs/remotes/origin/claude/conflict", conflict);
  git("checkout", "-b", "feature/clean", initial);
  const clean = commit("new.txt", "Independent work");
  git("update-ref", "refs/remotes/origin/feature/clean", clean);
  git("checkout", "main");
  const base = commit("shared.txt", "Main work");
  git("update-ref", "refs/remotes/origin/main", base);
  git("update-ref", "refs/remotes/origin/included", initial);
  writeFileSync(join(root, "unsaved.txt"), "Do not commit or discard this");
  const data = inventoryRepository({
    root,
    prs: [
      {
        number: 10,
        title: "Claude changes",
        url: "https://example.invalid/10",
        headRefName: "claude/conflict",
        headRefOid: conflict,
        baseRefName: "main",
        isDraft: true,
        ciState: "FAILURE",
      },
      {
        number: 11,
        title: "Dependent work not fetched",
        url: "https://example.invalid/11",
        headRefName: "unfetched/feature",
        headRefOid: "a".repeat(40),
        baseRefName: "claude/conflict",
        isDraft: false,
        ciState: "SUCCESS",
      },
    ],
  });
  expect(data.baseSha).toBe(base);
  expect(data.summary).toMatchObject({
    remoteBranches: 4,
    includedBranches: 2,
    pendingBranches: 2,
    branchesWithConflicts: 1,
    pendingWithoutOpenPr: 1,
    claudeBranches: 1,
    dirtyWorktrees: 1,
    prsWithUncapturedHead: 1,
  });
  expect(
    data.branches.find((branch: { name: string }) => branch.name === "claude/conflict"),
  ).toMatchObject({
    sha: conflict,
    conflicts: ["shared.txt"],
    pullRequests: [10],
    headMatchesPr: true,
    mergeToBase: "conflicts",
  });
  expect(
    data.branches.find((branch: { name: string }) => branch.name === "feature/clean"),
  ).toMatchObject({ sha: clean, changedFiles: ["new.txt"], mergeToBase: "clean-tree-only" });
  expect(inventoryMarkdown(data)).toContain("CI FAILURE");
  expect(inventoryMarkdown(data)).toContain("rascunho");
  expect(data.pullRequests.find((pr: { number: number }) => pr.number === 11)).toMatchObject({
    dependsOn: [10],
    headCapturedMatchesSha: false,
  });
  expect(git("rev-parse", "HEAD")).toBe(base);
  expect(git("rev-parse", "refs/remotes/origin/claude/conflict")).toBe(conflict);
  expect(git("status", "--porcelain")).toBe("?? unsaved.txt");
  expect(readFileSync(join(root, "unsaved.txt"), "utf8")).toBe("Do not commit or discard this");
});

it("recusa uma cópia rasa para não confundir histórico ausente com trabalho não integrado", () => {
  const root = mkdtempSync(join(tmpdir(), "siga-release-shallow-"));
  temporary.push(root);
  execFileSync("git", ["init", "--initial-branch=main", root], { stdio: "pipe" });
  writeFileSync(join(root, ".git", "shallow"), "a".repeat(40) + "\n");
  expect(() => inventoryRepository({ root })).toThrow(/Full history is required/);
});
