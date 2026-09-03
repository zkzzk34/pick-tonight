import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const token = process.env.TMDB_API_READ_TOKEN?.trim();

if (
  !token ||
  token === "replace_with_your_tmdb_api_read_access_token" ||
  token.startsWith("Bearer ")
) {
  console.error(
    "A raw TMDB_API_READ_TOKEN is required for the boundary check.",
  );
  process.exit(1);
}

const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

try {
  execFileSync("git", ["check-ignore", "-q", ".env"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
} catch {
  console.error("Secret-boundary check failed: .env is not ignored by Git.");
  process.exit(1);
}

const tokenBytes = Buffer.from(token);
const workingPaths = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: repositoryRoot, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const leakingWorkingPaths = workingPaths.filter((path) => {
  const absolutePath = resolve(repositoryRoot, path);

  return (
    existsSync(absolutePath) && readFileSync(absolutePath).includes(tokenBytes)
  );
});

if (leakingWorkingPaths.length > 0) {
  console.error(
    "Secret-boundary check failed: the token appears in project files:",
  );
  for (const path of leakingWorkingPaths) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

const gitObjects = execFileSync(
  "git",
  [
    "cat-file",
    "--batch-all-objects",
    "--batch-check=%(objectname) %(objecttype)",
  ],
  { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
)
  .trim()
  .split("\n")
  .map((line) => line.split(" "))
  .filter(([, objectType]) => objectType === "blob");

const leakingObjectIds = [];
for (const [objectId] of gitObjects) {
  const blob = execFileSync("git", ["cat-file", "blob", objectId], {
    cwd: repositoryRoot,
    encoding: "buffer",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (blob.includes(tokenBytes)) {
    leakingObjectIds.push(objectId);
  }
}

if (leakingObjectIds.length > 0) {
  console.error(
    "Secret-boundary check failed: the token appears in Git objects:",
  );
  for (const objectId of leakingObjectIds) {
    console.error(`- ${objectId}`);
  }
  process.exit(1);
}

const browserPaths = [
  "proofs/tmdb-server-only/index.html",
  "proofs/tmdb-server-only/browser.js",
];
const forbiddenBrowserText = [
  token,
  "TMDB_API_READ_TOKEN",
  "api.themoviedb.org",
  "Authorization",
];

for (const path of browserPaths) {
  const source = readFileSync(resolve(repositoryRoot, path), "utf8");
  const forbiddenValue = forbiddenBrowserText.find((value) =>
    source.includes(value),
  );

  if (forbiddenValue !== undefined) {
    console.error(`Secret-boundary check failed for browser asset: ${path}`);
    process.exit(1);
  }
}

console.log("Secret-boundary checks passed:");
console.log("- .env is ignored by Git");
console.log("- the token is absent from project files and Git objects");
console.log(
  "- browser assets contain no credential or direct TMDB API request",
);
