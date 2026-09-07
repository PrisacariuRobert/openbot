import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Inspect the Git index, not the owner's ignored runtime directory. Never print
// matched content: a failing CI log must not become another credential leak.
export function sourceFindings(file, content = "", mode = "100644") {
  const findings = [];
  const segments = file.split("/");
  const name = segments.at(-1) || "";
  if (segments.some((part) => [".openbot", "node_modules", "DerivedData", "xcuserdata", ".ssh"].includes(part))) {
    findings.push("private runtime, dependency, or machine-local directory");
  }
  if ((name.startsWith(".env") && name !== ".env.example") ||
      /^(access\.token|vault\.key|web-push\.json|auth\.json|credentials\.json|cookies\.json|Login Data|Cookies)$/i.test(name) ||
      /\.(sqlite(?:3)?(?:-wal|-shm)?|db-wal|db-shm|p8|p12|pfx|mobileprovision|xcuserstate)$/i.test(name)) {
    findings.push("private data or credential filename");
  }
  if (!["100644", "100755"].includes(mode)) {
    findings.push("source entry is not a regular file; review links or submodules separately");
  }
  const signatures = [
    ["private key material", /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{32,}/],
    ["GitHub credential-shaped value", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{70,})\b/],
    ["provider credential-shaped value", /\b(?:sk-(?:proj-|ant-)[A-Za-z0-9_-]{32,}|xox[baprs]-[0-9A-Za-z-]{24,}|AIza[0-9A-Za-z_-]{35})\b/],
  ];
  for (const [label, expression] of signatures) if (expression.test(content)) findings.push(label);
  return findings;
}

export function checkIndex(cwd = process.cwd()) {
  const entries = execFileSync("git", ["ls-files", "--stage", "-z"], { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0").filter(Boolean);
  const failures = [];
  for (const entry of entries) {
    const match = entry.match(/^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/);
    if (!match) throw new Error("Cannot parse source index.");
    const [, mode, object, stage, file] = match;
    if (stage !== "0") { failures.push({ file, findings: ["unresolved merge stage"] }); continue; }
    const content = mode === "160000" ? "" : execFileSync("git", ["cat-file", "blob", object], { cwd, maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
    const findings = sourceFindings(file, content, mode);
    if (findings.length) failures.push({ file, findings });
  }
  return { count: entries.length, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkIndex();
    if (result.failures.length) {
      console.error("Public-source check failed. Matched values are withheld:");
      for (const finding of result.failures) console.error(`- ${JSON.stringify(finding.file)}: ${finding.findings.join("; ")}`);
      process.exitCode = 1;
    } else {
      console.log(`Public-source check passed for ${result.count} indexed files. This checks known paths and credential signatures, not Git history or every possible secret.`);
    }
  } catch {
    console.error("Public-source check could not inspect the complete Git index; release is blocked.");
    process.exitCode = 1;
  }
}
