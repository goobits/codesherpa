import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sherpaPkgPath = path.join(repoRoot, "packages/sherpa/package.json");
const rootPkgPath = path.join(repoRoot, "package.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function run(cmd, args, options = {}) {
  execFileSync(cmd, args, { stdio: "inherit", ...options });
}

function runCapture(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...options });
}

function gitChangedFiles() {
  const result = runCapture("git", ["status", "--porcelain"], { cwd: repoRoot });
  if (result.status !== 0) {
    throw new Error(`git status failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const entry = line.slice(3).trim();
      const renameIndex = entry.lastIndexOf(" -> ");
      return renameIndex === -1 ? entry : entry.slice(renameIndex + 4);
    });
}

const allowedChanges = new Set([
  "package.json",
  "packages/sherpa/package.json",
]);

const sherpaPkg = readJson(sherpaPkgPath);
const rootPkg = readJson(rootPkgPath);
const pkgName = sherpaPkg.name;
const currentVersion = sherpaPkg.version;

const viewResult = runCapture(
  "npm",
  ["view", `${pkgName}@${currentVersion}`, "version"],
  { cwd: repoRoot }
);

let needsBump = false;
if (viewResult.status === 0) {
  needsBump = true;
} else {
  const combined = `${viewResult.stdout}\n${viewResult.stderr}`;
  if (!/E404|404 Not Found|code E404/i.test(combined)) {
    throw new Error(`npm view failed:\n${combined}`);
  }
}

const changedBefore = gitChangedFiles();
const onlyAllowedBefore = changedBefore.every((file) => allowedChanges.has(file));

if (needsBump) {
  if (!onlyAllowedBefore) {
    throw new Error(
      "Version already published. Clean the working tree or keep only package.json changes before releasing."
    );
  }

  run("npm", ["version", "patch", "--no-git-tag-version"], {
    cwd: path.dirname(sherpaPkgPath),
  });

  const bumpedVersion = readJson(sherpaPkgPath).version;
  if (rootPkg.version !== bumpedVersion) {
    rootPkg.version = bumpedVersion;
    writeJson(rootPkgPath, rootPkg);
  }

  const changedAfter = gitChangedFiles();
  const onlyAllowedAfter = changedAfter.every((file) => allowedChanges.has(file));
  if (onlyAllowedAfter) {
    run("git", ["add", "package.json", "packages/sherpa/package.json"], {
      cwd: repoRoot,
    });
    run("git", ["commit", "-m", `chore: bump sherpa to ${bumpedVersion}`], {
      cwd: repoRoot,
    });
  }
}

run("npm", ["publish", "--access", "public"], {
  cwd: path.dirname(sherpaPkgPath),
});
