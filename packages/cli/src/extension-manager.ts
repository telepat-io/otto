import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import { homedir } from 'node:os';

export type ExtensionInstallOptions = {
  version: string;
  outputDir?: string;
  releaseBaseUrl?: string;
  timeoutMs?: number;
};

export type ExtensionInstallResult = {
  source: 'download';
  version: string;
  zipPath?: string;
  unpackedPath: string;
  checksumSha256?: string;
  releaseBaseUrl?: string;
};

const DEFAULT_RELEASE_BASE_URL = 'https://github.com/telepat-io/otto/releases/download';

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function sha256File(path: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

export function parseChecksum(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Checksum file is empty');
  }

  const hexMatch = trimmed.match(/[a-fA-F0-9]{64}/);
  if (!hexMatch || !hexMatch[0]) {
    throw new Error('Checksum file does not contain a valid sha256 value');
  }
  return hexMatch[0].toLowerCase();
}

function findManifestRoot(startDir: string): string {
  const stack = [startDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = readdirSync(current, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === 'manifest.json')) {
      return current;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(join(current, entry.name));
      }
    }
  }

  throw new Error('Downloaded extension archive does not contain manifest.json');
}

async function fetchToFile(url: string, outputPath: string, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}) for ${url}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    writeFileSync(outputPath, bytes);
  } finally {
    clearTimeout(timeout);
  }
}

async function installFromDownload(opts: Required<Pick<ExtensionInstallOptions, 'version'>> & {
  outputDir?: string;
  releaseBaseUrl?: string;
  timeoutMs?: number;
}): Promise<ExtensionInstallResult> {
  const versionDir = join(resolve(opts.outputDir ?? join(homedir(), '.otto', 'extensions')), opts.version);
  const releaseBaseUrl = opts.releaseBaseUrl ?? DEFAULT_RELEASE_BASE_URL;
  const timeoutMs = Math.max(1000, opts.timeoutMs ?? 25_000);
  const zipName = `otto-extension-${opts.version}-chrome-mv3.zip`;
  const checksumName = `${zipName}.sha256`;

  const zipUrl = `${releaseBaseUrl}/v${opts.version}/${zipName}`;
  const checksumUrl = `${releaseBaseUrl}/v${opts.version}/${checksumName}`;

  ensureDir(versionDir);

  const zipPath = join(versionDir, zipName);
  const checksumPath = join(versionDir, checksumName);
  const extractPath = join(versionDir, '_extract');
  const finalPath = join(versionDir, 'chrome-mv3');

  await fetchToFile(zipUrl, zipPath, timeoutMs);
  await fetchToFile(checksumUrl, checksumPath, timeoutMs);

  const expectedChecksum = parseChecksum(readFileSync(checksumPath, 'utf8'));
  const actualChecksum = sha256File(zipPath);
  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Checksum mismatch for extension zip. expected=${expectedChecksum} actual=${actualChecksum}`);
  }

  rmSync(extractPath, { recursive: true, force: true });
  rmSync(finalPath, { recursive: true, force: true });
  ensureDir(extractPath);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractPath, true);

  const manifestRoot = findManifestRoot(extractPath);
  cpSync(manifestRoot, finalPath, { recursive: true });

  return {
    source: 'download',
    version: opts.version,
    zipPath,
    unpackedPath: finalPath,
    checksumSha256: expectedChecksum,
    releaseBaseUrl,
  };
}

export async function installExtensionArtifact(opts: ExtensionInstallOptions): Promise<ExtensionInstallResult> {
  return installFromDownload({
    version: opts.version,
    outputDir: opts.outputDir,
    releaseBaseUrl: opts.releaseBaseUrl,
    timeoutMs: opts.timeoutMs,
  });
}
