import { execFileSync, spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
import { closeSync, ftruncateSync, mkdtempSync, mkdirSync, openSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import * as secretScanModule from "./secret-scan.mjs";

const { findSecretFindings, formatSecretFinding, scanRepositorySecrets } = secretScanModule;

const temporaryDirectories = [];
const SECRET_SCAN_SCRIPT = resolve(process.cwd(), "scripts/secret-scan.mjs");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("secret scan", () => {
  it("scans ignored frontend and final desktop release artifacts without exposing values", () => {
    expect(typeof secretScanModule.scanReleaseArtifactSecrets).toBe("function");
    if (typeof secretScanModule.scanReleaseArtifactSecrets !== "function") {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "release-artifact-secret-scan-"));
    temporaryDirectories.push(root);
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    writeFileSync(join(root, ".gitignore"), "dist/\nsrc-tauri/target/\n", "utf8");

    const distSecret = ["sk", "live", "R".repeat(32)].join("-");
    const installerSecret = ["github", "pat", "S".repeat(40)].join("_");
    const utf16Secret = ["1", "ts", "T".repeat(48)].join("");
    mkdirSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(root, "src-tauri", "target", "release", "bundle", "nsis"), { recursive: true });
    writeFileSync(join(root, "dist", "app.js"), distSecret, "utf8");
    writeFileSync(join(root, "src-tauri", "target", "release", "app.exe"), Buffer.from(installerSecret, "ascii"));
    writeFileSync(
      join(root, "src-tauri", "target", "release", "bundle", "nsis", "setup.exe"),
      Buffer.from(utf16Secret, "utf16le"),
    );

    const findings = secretScanModule.scanReleaseArtifactSecrets(root);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "dist/app.js", rule: "openai-like-key" }),
      expect.objectContaining({ path: "src-tauri/target/release/app.exe", rule: "known-service-token" }),
      expect.objectContaining({ path: "src-tauri/target/release/bundle/nsis/setup.exe", rule: "step-like-key" }),
    ]));
    const output = findings.map(formatSecretFinding).join("\n");
    expect(output).not.toContain(distSecret);
    expect(output).not.toContain(installerSecret);
    expect(output).not.toContain(utf16Secret);
    expect(scanRepositorySecrets(root)).toEqual([]);
  });

  it("supports release-artifact CLI mode with path-and-rule-only output", () => {
    const root = mkdtempSync(join(tmpdir(), "release-artifact-secret-cli-"));
    temporaryDirectories.push(root);
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    writeFileSync(join(root, ".gitignore"), "dist/\n", "utf8");
    const secret = ["sk", "live", "U".repeat(32)].join("-");
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist", "app.js"), secret, "utf8");

    const result = spawnSync(process.execPath, [SECRET_SCAN_SCRIPT, "--release-artifacts"], {
      cwd: root,
      encoding: "utf8",
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    expect(result.status).toBe(1);
    expect(output).toContain("dist/app.js: openai-like-key");
    expect(output).not.toContain(secret);
  });

  it("streams a sparse installer beyond the former size cutoff and detects its secret", () => {
    const root = mkdtempSync(join(tmpdir(), "large-release-artifact-secret-scan-"));
    temporaryDirectories.push(root);
    const installerDir = join(root, "src-tauri", "target", "release", "bundle", "nsis");
    const installerPath = join(installerDir, "large-setup.exe");
    const secret = ["sk", "live", "V".repeat(32)].join("-");
    const secretOffset = 256 * 1024 * 1024 + 4093;
    mkdirSync(installerDir, { recursive: true });

    const descriptor = openSync(installerPath, "w");
    try {
      ftruncateSync(descriptor, secretOffset + secret.length + 4096);
      writeSync(descriptor, Buffer.from(secret, "ascii"), 0, secret.length, secretOffset);
    } finally {
      closeSync(descriptor);
    }

    const findings = secretScanModule.scanReleaseArtifactSecrets(root);
    expect(findings).toContainEqual(
      expect.objectContaining({
        path: "src-tauri/target/release/bundle/nsis/large-setup.exe",
        rule: "openai-like-key",
      }),
    );
    expect(findings.map(formatSecretFinding).join("\n")).not.toContain(secret);
  }, 30_000);

  it("fails closed when an expected artifact cannot be read without exposing the error secret", () => {
    const root = mkdtempSync(join(tmpdir(), "unreadable-release-artifact-secret-scan-"));
    temporaryDirectories.push(root);
    const installerDir = join(root, "src-tauri", "target", "release", "bundle", "nsis");
    const installerPath = join(installerDir, "unreadable-setup.exe");
    const secret = ["sk", "live", "W".repeat(32)].join("-");
    mkdirSync(installerDir, { recursive: true });
    writeFileSync(installerPath, "installer bytes", "utf8");

    const findings = secretScanModule.scanReleaseArtifactSecrets(root, {
      fs: {
        ...nodeFs,
        openSync(path, flags) {
          if (resolve(path) === resolve(installerPath)) {
            throw new Error(`read failed ${secret}`);
          }
          return nodeFs.openSync(path, flags);
        },
      },
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        path: "src-tauri/target/release/bundle/nsis/unreadable-setup.exe",
        rule: "artifact-scan-error",
      }),
    );
    expect(findings.map(formatSecretFinding).join("\n")).not.toContain(secret);
  });

  it("detects real-looking prefixed and assigned tokens without returning matched values", () => {
    const openAiLike = ["sk", "live", "A".repeat(32)].join("-");
    const stepLike = ["1", "ts", "B".repeat(48)].join("");
    const assigned = ["Ab3", "dE4", "Fg5", "hI6", "Jk7", "Lm8", "Np9", "Qr0"].join("_");
    const findings = findSecretFindings({
      "src/example.ts": `const api_key = "${assigned}";`,
      "dist-static/index.html": `${openAiLike}\n${stepLike}`,
    });

    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(["openai-like-key", "step-like-key", "sensitive-assignment"]),
    );
    const serialized = findings.map(formatSecretFinding).join("\n");
    expect(serialized).not.toContain(openAiLike);
    expect(serialized).not.toContain(stepLike);
    expect(serialized).not.toContain(assigned);
  });

  it("detects real-looking placeholder credentials instead of using a broad exemption", () => {
    const openAiPlaceholder = ["sk", "test", "placeholder", "A".repeat(24)].join("-");
    const assignedPlaceholder = ["test", "secret", "Ab3Cd4Ef5Gh6Ij7Kl8Mn9"].join("-");
    const bearerPlaceholder = ["mock", "token", "C".repeat(24)].join("-");
    const findings = findSecretFindings({
      "src/example.test.ts": [
        openAiPlaceholder,
        `api_key=${assignedPlaceholder}`,
        `Authorization: Bearer ${bearerPlaceholder}`,
      ].join("\n"),
    });

    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(["openai-like-key", "sensitive-assignment", "bearer-token"]),
    );
  });

  it("does not suppress a high-entropy token merely because test appears inside a random segment", () => {
    const token = ["AbC", "test", "XyZ1234567890", "QrStUv"].join("");
    const findings = findSecretFindings({
      "src/example.ts": `api_key = "${token}";`,
    });

    expect(findings).toEqual([
      expect.objectContaining({ path: "src/example.ts", rule: "sensitive-assignment" }),
    ]);
  });

  it("does not suppress a real-looking prefixed key merely because one segment says test", () => {
    const token = ["sk", "live", "A".repeat(16), "test", "B".repeat(16)].join("-");

    expect(findSecretFindings({ "src/example.ts": token })).toEqual([
      expect.objectContaining({ path: "src/example.ts", rule: "openai-like-key" }),
    ]);
  });

  it("detects GitHub fine-grained tokens and AWS secret assignments", () => {
    const githubToken = ["github", "pat", "C".repeat(40)].join("_");
    const awsSecret = ["Ab1", "Cd2", "Ef3", "Gh4", "Ij5", "Kl6", "Mn7", "Op8"].join("");
    const findings = findSecretFindings({
      "config.env": `${githubToken}\nAWS_SECRET_ACCESS_KEY=${awsSecret}`,
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "config.env", rule: "known-service-token" }),
        expect.objectContaining({ path: "config.env", rule: "sensitive-assignment" }),
      ]),
    );
  });

  it("scans tracked, untracked, dist, and configured e2e secrets without scanning the env file itself", () => {
    const root = mkdtempSync(join(tmpdir(), "static-secret-scan-"));
    temporaryDirectories.push(root);
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });

    const configuredSecret = ["configured", "D".repeat(32), "7".repeat(8)].join("-");
    const trackedSecret = ["ghp", "T".repeat(30)].join("_");
    const untrackedSecret = ["sk", "live", "E".repeat(32)].join("-");
    const distSecret = ["1", "ts", "F".repeat(48)].join("");
    writeFileSync(join(root, "tracked.md"), trackedSecret, "utf8");
    execFileSync("git", ["add", "tracked.md"], { cwd: root, stdio: "ignore" });
    writeFileSync(join(root, "untracked.md"), untrackedSecret, "utf8");
    writeFileSync(join(root, ".env.e2e.local"), `E2E_API_KEY=${configuredSecret}\n`, "utf8");
    writeFileSync(join(root, "configured-leak.md"), configuredSecret, "utf8");
    mkdirSync(join(root, "dist-static"));
    writeFileSync(join(root, "dist-static", "index.html"), distSecret, "utf8");

    const findings = scanRepositorySecrets(root);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "tracked.md", rule: "known-service-token" }),
        expect.objectContaining({ path: "untracked.md", rule: "openai-like-key" }),
        expect.objectContaining({ path: "dist-static/index.html", rule: "step-like-key" }),
        expect.objectContaining({ path: "configured-leak.md", rule: "configured-e2e-secret" }),
      ]),
    );
    expect(findings.some((finding) => finding.path === ".env.e2e.local")).toBe(false);
    expect(findings.map(formatSecretFinding).join("\n")).not.toContain(configuredSecret);
  });

  it("fails from the CLI with path-and-rule output that never includes the secret value", () => {
    const root = mkdtempSync(join(tmpdir(), "static-secret-scan-cli-"));
    temporaryDirectories.push(root);
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });

    const secret = ["sk", "live", "H".repeat(32)].join("-");
    writeFileSync(join(root, "tracked.md"), secret, "utf8");
    execFileSync("git", ["add", "tracked.md"], { cwd: root, stdio: "ignore" });

    const result = spawnSync(process.execPath, [SECRET_SCAN_SCRIPT], {
      cwd: root,
      encoding: "utf8",
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    expect(result.status).toBe(1);
    expect(output).toContain("tracked.md: openai-like-key");
    expect(output).not.toContain(secret);
  });

  it("scans untracked text files even when their extension is not on a language allowlist", () => {
    const root = mkdtempSync(join(tmpdir(), "static-secret-scan-extension-"));
    temporaryDirectories.push(root);
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });

    const secret = ["sk", "live", "G".repeat(32)].join("-");
    writeFileSync(join(root, "provider.credentials"), secret, "utf8");

    expect(scanRepositorySecrets(root)).toEqual([
      expect.objectContaining({ path: "provider.credentials", rule: "openai-like-key" }),
    ]);
  });
});
