import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(repoRoot, "dist");
const pagesBase = "/altborder/";
const deployBranch = "gh-pages";

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? "inherit",
  });
}

function tryRun(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  return spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? "inherit",
  });
}

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function emptyDirectoryExceptGit(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === ".git") {
      continue;
    }
    rmSync(join(directory, entry), { recursive: true, force: true });
  }
}

async function copyDirectoryContents(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    await cp(join(source, entry), join(destination, entry), { recursive: true });
  }
}

async function main() {
  const originUrl = capture("git", ["config", "--get", "remote.origin.url"]);
  const tmpRoot = mkdtempSync(join(tmpdir(), "altborder-pages-"));

  try {
    run("npm", ["run", "build", "--", `--base=${pagesBase}`]);

    if (!existsSync(join(distDir, "index.html"))) {
      throw new Error("Build completed, but dist/index.html was not found.");
    }

    const cloneExistingBranch = tryRun("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      deployBranch,
      originUrl,
      tmpRoot,
    ]);

    if (cloneExistingBranch.status !== 0) {
      rmSync(tmpRoot, { recursive: true, force: true });
      mkdirSync(tmpRoot, { recursive: true });
      run("git", ["clone", "--depth", "1", originUrl, tmpRoot]);
      run("git", ["checkout", "--orphan", deployBranch], { cwd: tmpRoot });
    }

    emptyDirectoryExceptGit(tmpRoot);
    await copyDirectoryContents(distDir, tmpRoot);
    writeFileSync(join(tmpRoot, ".nojekyll"), "");

    run("git", ["add", "-A"], { cwd: tmpRoot });

    const hasChanges = spawnSync("git", ["diff", "--cached", "--quiet"], {
      cwd: tmpRoot,
      stdio: "inherit",
    }).status !== 0;

    if (!hasChanges) {
      console.log("No deployment changes to publish.");
      return;
    }

    run("git", ["commit", "-m", "Deploy GitHub Pages"], { cwd: tmpRoot });
    run("git", ["push", "origin", deployBranch], { cwd: tmpRoot });
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
