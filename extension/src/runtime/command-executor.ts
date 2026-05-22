import { nanoid } from 'nanoid';
import type { CommandPayload } from '@telepat/otto-protocol';
import { listCommandsForRuntime, runCommandAction, runCommandTestAction } from './command-runtime.js';
import { CommandExecutionError } from './execution-error.js';
import { getDebuggerFocusEmulationManager } from './listener-managers.js';
import { createSingleFlight } from './single-flight.js';

type ChromeLike = typeof chrome;
const AUTOMATION_GROUP_SINGLE_FLIGHT_KEY = 'automation-group.ensure';
const READABILITY_SCRIPT_FILE = 'distill-libs/readability.js';
const DOM_DISTILLER_SCRIPT_FILE = 'distill-libs/dom-distiller.js';
const EXTRACTION_TAB_READY_TIMEOUT_MS = 15_000;
const EXTRACTION_TAB_POLL_INTERVAL_MS = 150;
const DISTILL_SCRIPT_INSTALL_MAX_ATTEMPTS = 3;
const DISTILL_SCRIPT_INSTALL_RETRY_DELAY_MS = 200;
const SCREENSHOT_MAX_BYTES_DEFAULT = 1_500_000;
const SCREENSHOT_MAX_BYTES_MIN = 50_000;
const SCREENSHOT_MAX_BYTES_MAX = 20_000_000;
const SCREENSHOT_MAX_CAPTURE_ATTEMPTS = 5;
const SCREENSHOT_MIN_JPEG_QUALITY = 35;
const SCREENSHOT_MIN_SCALE = 0.4;

const runtimeSingleFlight = createSingleFlight();

export type CommandExecutionResult = {
  durationMs: number;
  data: unknown;
};

type ExtractionTarget = {
  tabId: number;
  tabSessionId: string | null;
  sourceUrlInput: string | null;
  temporaryTab: boolean;
};

type DistilledArticle = {
  html: string;
  title: string | null;
  sourceUrl: string;
  mode: 'readability' | 'dom-distiller';
  fallbackUsed: boolean;
};

type DistillationFailure = {
  mode: 'readability' | 'dom-distiller';
  reason: string;
};

type ScreenshotFormat = 'png' | 'jpeg';

type ScreenshotMode = 'viewport' | 'full_page';

type ScreenshotPayload = {
  format: ScreenshotFormat;
  mode: ScreenshotMode;
  quality: number;
  maxBytes: number;
};

type ScreenshotCaptureResult = {
  contentBase64: string;
  mimeType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  quality: number;
  scale: number;
};

type CdpLayoutMetrics = {
  width: number;
  height: number;
};

type ExtractionTabProbe = {
  url: string | null;
  status: string | null;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForExtractionTabReady(chromeApi: ChromeLike, tabId: number): Promise<ExtractionTabProbe> {
  const deadline = Date.now() + EXTRACTION_TAB_READY_TIMEOUT_MS;
  let lastProbe: ExtractionTabProbe = { url: null, status: null };

  while (Date.now() <= deadline) {
    try {
      const tab = await chromeApi.tabs.get(tabId);
      lastProbe = {
        url: typeof tab.url === 'string' ? tab.url : null,
        status: typeof tab.status === 'string' ? tab.status : null,
      };

      // Some test doubles and older tab snapshots omit `status`; if URL is present,
      // treat that as ready rather than stalling until timeout.
      if ((lastProbe.status === 'complete' || lastProbe.status === null) && lastProbe.url) {
        return lastProbe;
      }
    } catch {
      // Keep polling until timeout; caller will map final state to command error.
    }

    await wait(EXTRACTION_TAB_POLL_INTERVAL_MS);
  }

  return lastProbe;
}

async function ensureTemporaryExtractionTabReady(
  chromeApi: ChromeLike,
  target: ExtractionTarget,
  stage: 'primitive.dom.extract_html' | 'primitive.dom.extract_clean_html' | 'primitive.dom.extract_distilled_html' | 'primitive.dom.extract_markdown' | 'primitive.page.screenshot',
): Promise<void> {
  if (!target.temporaryTab) {
    return;
  }

  const probe = await waitForExtractionTabReady(chromeApi, target.tabId);
  if (!probe.url || (probe.status !== 'complete' && probe.status !== null)) {
    throw new CommandExecutionError(
      `Temporary extraction tab URL was not ready before execution (status=${probe.status ?? 'unknown'})`,
      'tab_url_not_ready',
      stage,
      true,
    );
  }
}

function isMissingTabGroupError(error: unknown): boolean {
  const candidates: string[] = [];

  if (typeof error === 'string') {
    candidates.push(error);
  }

  if (error && typeof error === 'object') {
    const asRecord = error as Record<string, unknown>;
    const directMessage = asRecord.message;
    if (typeof directMessage === 'string') {
      candidates.push(directMessage);
    }

    const nestedLastError = asRecord.lastError;
    if (nestedLastError && typeof nestedLastError === 'object') {
      const nestedMessage = (nestedLastError as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string') {
        candidates.push(nestedMessage);
      }
    }

    const nestedCause = asRecord.cause;
    if (nestedCause && typeof nestedCause === 'object') {
      const nestedMessage = (nestedCause as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string') {
        candidates.push(nestedMessage);
      }
    }

    try {
      candidates.push(JSON.stringify(error));
    } catch {
      // Ignore circular or non-serializable objects.
    }
  }

  if (candidates.length === 0) {
    candidates.push(String(error ?? ''));
  }

  return candidates.some((candidate) => /no group with id/i.test(candidate));
}

function isNonNormalWindowTabGroupingError(error: unknown): boolean {
  const candidates: string[] = [];

  if (typeof error === 'string') {
    candidates.push(error);
  }

  if (error && typeof error === 'object') {
    const asRecord = error as Record<string, unknown>;
    const directMessage = asRecord.message;
    if (typeof directMessage === 'string') {
      candidates.push(directMessage);
    }

    const nestedLastError = asRecord.lastError;
    if (nestedLastError && typeof nestedLastError === 'object') {
      const nestedMessage = (nestedLastError as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string') {
        candidates.push(nestedMessage);
      }
    }

    const nestedCause = asRecord.cause;
    if (nestedCause && typeof nestedCause === 'object') {
      const nestedMessage = (nestedCause as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string') {
        candidates.push(nestedMessage);
      }
    }

    try {
      candidates.push(JSON.stringify(error));
    } catch {
      // Ignore circular or non-serializable objects.
    }
  }

  if (candidates.length === 0) {
    candidates.push(String(error ?? ''));
  }

  return candidates.some((candidate) => /tabs can only be moved to and from normal windows/i.test(candidate));
}

async function clearAutomationGroupId(chromeApi: ChromeLike): Promise<void> {
  await chromeApi.storage.session.set({ automationGroupId: null });
}

async function ensureAutomationGroup(chromeApi: ChromeLike, seedTabId: number): Promise<number> {
  return runtimeSingleFlight.run(AUTOMATION_GROUP_SINGLE_FLIGHT_KEY, async () => {
    const existing = await chromeApi.storage.session.get(['automationGroupId']);
    const existingGroupId = typeof existing.automationGroupId === 'number'
      ? existing.automationGroupId
      : undefined;

    if (existingGroupId) {
      try {
        await chromeApi.tabGroups.update(existingGroupId, {
          title: 'Otto',
          color: 'blue',
          collapsed: true,
        });
        return existingGroupId;
      } catch (error) {
        if (!isMissingTabGroupError(error)) {
          throw error;
        }
        await clearAutomationGroupId(chromeApi);
      }
    }

    const groupId = await chromeApi.tabs.group({ tabIds: [seedTabId] as [number] });
    await chromeApi.tabGroups.update(groupId as number, {
      title: 'Otto',
      color: 'blue',
      collapsed: true,
    });
    await chromeApi.storage.session.set({ automationGroupId: groupId });
    return groupId as number;
  });
}

async function applyAutomationGroupPresentation(chromeApi: ChromeLike, groupId: number): Promise<void> {
  await chromeApi.tabGroups.update(groupId, {
    title: 'Otto',
    color: 'blue',
    collapsed: true,
  });
}

async function attachTabToAutomationGroup(chromeApi: ChromeLike, tabId: number): Promise<number> {
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let groupId: number;
    try {
      groupId = await ensureAutomationGroup(chromeApi, tabId);
    } catch (error) {
      if (isNonNormalWindowTabGroupingError(error)) {
        return -1;
      }
      throw error;
    }

    try {
      await chromeApi.tabs.group({ groupId, tabIds: [tabId] as [number] });
      return groupId;
    } catch (error) {
      if (isNonNormalWindowTabGroupingError(error)) {
        return -1;
      }

      if (!isMissingTabGroupError(error)) {
        throw error;
      }

      await clearAutomationGroupId(chromeApi);
    }
  }

  try {
    const freshGroupId = await chromeApi.tabs.group({ tabIds: [tabId] as [number] });
    await applyAutomationGroupPresentation(chromeApi, freshGroupId as number);
    await chromeApi.storage.session.set({ automationGroupId: freshGroupId });
    return freshGroupId as number;
  } catch (error) {
    if (isNonNormalWindowTabGroupingError(error)) {
      return -1;
    }
    throw error;
  }
}

async function getTabSessions(chromeApi: ChromeLike): Promise<Record<string, number>> {
  const map = await chromeApi.storage.session.get(['tabSessions']);
  return (map.tabSessions as Record<string, number> | undefined) ?? {};
}

async function saveTabSessions(chromeApi: ChromeLike, tabSessions: Record<string, number>): Promise<void> {
  await chromeApi.storage.session.set({ tabSessions });
}

async function getTabSessionOwners(chromeApi: ChromeLike): Promise<Record<string, string>> {
  const map = await chromeApi.storage.session.get(['tabSessionOwners']);
  return (map.tabSessionOwners as Record<string, string> | undefined) ?? {};
}

async function saveTabSessionOwners(chromeApi: ChromeLike, tabSessionOwners: Record<string, string>): Promise<void> {
  await chromeApi.storage.session.set({ tabSessionOwners });
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readNumberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function applyContentLimit(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  return content.slice(0, maxChars);
}

function parseScreenshotFormat(value: unknown): ScreenshotFormat {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'png';
  if (normalized === 'png') {
    return 'png';
  }
  if (normalized === 'jpeg' || normalized === 'jpg') {
    return 'jpeg';
  }

  throw new CommandExecutionError(
    'format must be png or jpeg',
    'invalid_screenshot_format',
    'validation',
    false,
  );
}

function parseScreenshotMode(value: unknown): ScreenshotMode {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'viewport';
  if (normalized === 'viewport') {
    return 'viewport';
  }
  if (normalized === 'full_page' || normalized === 'fullpage' || normalized === 'full-page') {
    return 'full_page';
  }

  throw new CommandExecutionError(
    'mode must be viewport or full_page',
    'invalid_screenshot_mode',
    'validation',
    false,
  );
}

function parseScreenshotQuality(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 80;
  }

  const floored = Math.floor(parsed);
  if (floored < 1 || floored > 100) {
    throw new CommandExecutionError(
      'quality must be between 1 and 100',
      'invalid_screenshot_quality',
      'validation',
      false,
    );
  }

  return floored;
}

function parseScreenshotPayload(command: CommandPayload): ScreenshotPayload {
  return {
    format: parseScreenshotFormat(command.payload.format),
    mode: parseScreenshotMode(command.payload.mode),
    quality: parseScreenshotQuality(command.payload.quality),
    maxBytes: readNumberInRange(
      command.payload.maxBytes,
      SCREENSHOT_MAX_BYTES_DEFAULT,
      SCREENSHOT_MAX_BYTES_MIN,
      SCREENSHOT_MAX_BYTES_MAX,
    ),
  };
}

function computeBase64ByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) {
    return 0;
  }

  let padding = 0;
  if (base64.endsWith('==')) {
    padding = 2;
  } else if (base64.endsWith('=')) {
    padding = 1;
  }

  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const decode = typeof atob === 'function'
    ? atob
    : (value: string) => {
      const runtime = globalThis as {
        Buffer?: {
          from: (input: string, encoding: string) => { toString: (format: string) => string };
        };
      };
      if (!runtime.Buffer) {
        throw new Error('base64_decode_unavailable');
      }
      return runtime.Buffer.from(value, 'base64').toString('binary');
    };

  const text = decode(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i);
  }
  return bytes;
}

function getPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) {
    return null;
  }

  const pngHeader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < pngHeader.length; i += 1) {
    if (bytes[i] !== pngHeader[i]) {
      return null;
    }
  }

  const width = (bytes[16] << 24) + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19];
  const height = (bytes[20] << 24) + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23];
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function getJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xFF) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xD9 || marker === 0xDA) {
      break;
    }

    const size = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (size < 2 || offset + 2 + size > bytes.length) {
      break;
    }

    const isSofMarker = (marker >= 0xC0 && marker <= 0xC3)
      || (marker >= 0xC5 && marker <= 0xC7)
      || (marker >= 0xC9 && marker <= 0xCB)
      || (marker >= 0xCD && marker <= 0xCF);
    if (isSofMarker) {
      const height = (bytes[offset + 5] << 8) + bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) + bytes[offset + 8];
      if (width > 0 && height > 0) {
        return { width, height };
      }
      return null;
    }

    offset += 2 + size;
  }

  return null;
}

function tryReadImageDimensions(contentBase64: string, mimeType: string): { width: number; height: number } | null {
  try {
    const bytes = decodeBase64ToBytes(contentBase64);
    if (mimeType === 'image/png') {
      return getPngDimensions(bytes);
    }
    if (mimeType === 'image/jpeg') {
      return getJpegDimensions(bytes);
    }
    return null;
  } catch {
    return null;
  }
}

async function getTabSourceUrl(chromeApi: ChromeLike, tabId: number, fallback: string | null): Promise<string | null> {
  try {
    const tab = await chromeApi.tabs.get(tabId);
    if (typeof tab.url === 'string' && tab.url.length > 0) {
      return tab.url;
    }
  } catch {
    // Ignore failures and use fallback below.
  }
  return fallback;
}

async function captureViewportScreenshot(
  chromeApi: ChromeLike,
  tabId: number,
  format: ScreenshotFormat,
  quality: number,
): Promise<ScreenshotCaptureResult> {
  // tabs.captureVisibleTab only works for the active (foreground) tab, so we use CDP
  // Page.captureScreenshot without captureBeyondViewport to capture the viewport of any tab.
  if (!chromeApi.debugger) {
    throw new CommandExecutionError(
      'Debugger API is unavailable; cannot capture viewport screenshot',
      'screenshot_debugger_unavailable',
      'primitive.page.screenshot',
      false,
    );
  }

  let ownsAttachment = false;

  try {
    try {
      await chromeApi.debugger.attach({ tabId }, '1.3');
      ownsAttachment = true;
    } catch (error) {
      const classified = classifyScreenshotDebuggerAttachError(error);
      if (classified.code !== 'screenshot_debugger_conflict') {
        throw classified;
      }
      ownsAttachment = false;
    }

    const response = await chromeApi.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
      format,
      ...(format === 'jpeg' ? { quality } : {}),
      fromSurface: true,
    }) as {
      data?: string;
    };

    if (typeof response.data !== 'string' || response.data.length === 0) {
      throw new CommandExecutionError(
        'CDP screenshot capture returned empty image data',
        'screenshot_capture_failed',
        'primitive.page.screenshot',
        true,
      );
    }

    const byteLength = computeBase64ByteLength(response.data);
    const dimensions = tryReadImageDimensions(response.data, format === 'jpeg' ? 'image/jpeg' : 'image/png');

    return {
      contentBase64: response.data,
      mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
      byteLength,
      width: dimensions?.width ?? 0,
      height: dimensions?.height ?? 0,
      quality,
      scale: 1,
    };
  } finally {
    if (ownsAttachment) {
      try { await chromeApi.debugger.detach({ tabId }); } catch { /* ignore */ }
    }
  }
}

function classifyScreenshotDebuggerAttachError(error: unknown): CommandExecutionError {
  const message = String(error instanceof Error ? error.message : error ?? '').toLowerCase();
  if (message.includes('another debugger is already attached')) {
    return new CommandExecutionError(
      'Cannot capture full-page screenshot because another debugger is attached to the tab',
      'screenshot_debugger_conflict',
      'primitive.page.screenshot',
      false,
    );
  }

  if (message.includes('cannot access a chrome://') || message.includes('cannot access contents of')) {
    return new CommandExecutionError(
      'Cannot capture full-page screenshot on this tab due to browser security restrictions',
      'screenshot_debugger_permission_denied',
      'primitive.page.screenshot',
      false,
    );
  }

  return new CommandExecutionError(
    'Failed to attach debugger for full-page screenshot capture',
    'screenshot_debugger_attach_failed',
    'primitive.page.screenshot',
    true,
  );
}

async function getCdpLayoutMetrics(chromeApi: ChromeLike, tabId: number): Promise<CdpLayoutMetrics> {
  const response = await chromeApi.debugger.sendCommand({ tabId }, 'Page.getLayoutMetrics') as {
    contentSize?: {
      width?: number;
      height?: number;
    };
  };

  const width = Math.max(1, Math.ceil(Number(response?.contentSize?.width ?? 0)));
  const height = Math.max(1, Math.ceil(Number(response?.contentSize?.height ?? 0)));
  return { width, height };
}

async function captureFullPageScreenshot(
  chromeApi: ChromeLike,
  tabId: number,
  format: ScreenshotFormat,
  quality: number,
  scale: number,
): Promise<ScreenshotCaptureResult> {
  if (!chromeApi.debugger) {
    throw new CommandExecutionError(
      'Debugger API is unavailable; cannot capture full-page screenshot',
      'screenshot_debugger_unavailable',
      'primitive.page.screenshot',
      false,
    );
  }

  let ownsAttachment = false;

  try {
    try {
      await chromeApi.debugger.attach({ tabId }, '1.3');
      ownsAttachment = true;
    } catch (error) {
      const classified = classifyScreenshotDebuggerAttachError(error);
      if (classified.code !== 'screenshot_debugger_conflict') {
        throw classified;
      }
      ownsAttachment = false;
    }

    const metrics = await getCdpLayoutMetrics(chromeApi, tabId);
    const response = await chromeApi.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
      format,
      ...(format === 'jpeg' ? { quality } : {}),
      clip: {
        x: 0,
        y: 0,
        width: metrics.width,
        height: metrics.height,
        scale,
      },
      captureBeyondViewport: true,
      fromSurface: true,
    }) as {
      data?: string;
    };

    if (typeof response.data !== 'string' || response.data.length === 0) {
      throw new CommandExecutionError(
        'CDP screenshot capture returned empty image data',
        'screenshot_capture_failed',
        'primitive.page.screenshot',
        true,
      );
    }

    const byteLength = computeBase64ByteLength(response.data);
    const dimensions = tryReadImageDimensions(response.data, format === 'jpeg' ? 'image/jpeg' : 'image/png');
    const width = dimensions?.width ?? Math.max(1, Math.round(metrics.width * scale));
    const height = dimensions?.height ?? Math.max(1, Math.round(metrics.height * scale));

    return {
      contentBase64: response.data,
      mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
      byteLength,
      width,
      height,
      quality,
      scale,
    };
  } catch (error) {
    if (error instanceof CommandExecutionError) {
      throw error;
    }
    throw new CommandExecutionError(
      `Failed to capture full-page screenshot via CDP: ${summarizeError(error)}`,
      'screenshot_capture_failed',
      'primitive.page.screenshot',
      true,
    );
  } finally {
    if (ownsAttachment) {
      try {
        await chromeApi.debugger.detach({ tabId });
      } catch {
        // Ignore detach failures for transient tab lifecycle states.
      }
    }
  }
}

function nextScreenshotQuality(current: number): number {
  return Math.max(SCREENSHOT_MIN_JPEG_QUALITY, current - 15);
}

function nextScreenshotScale(current: number): number {
  return Math.max(SCREENSHOT_MIN_SCALE, Number((current * 0.8).toFixed(2)));
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function formatDistillationFailureMessage(base: string, failures: DistillationFailure[]): string {
  if (failures.length === 0) {
    return base;
  }

  const details = failures
    .map((failure) => `${failure.mode}: ${failure.reason}`)
    .join('; ');
  return `${base}. details=${details}`;
}

async function resolveExtractionTarget(chromeApi: ChromeLike, command: CommandPayload): Promise<ExtractionTarget> {
  const tabSessionId = asNonEmptyString(command.payload.tabSessionId ?? command.tabSessionId);
  const sourceUrlInput = asNonEmptyString(command.payload.url);

  if (tabSessionId) {
    return {
      tabId: await resolveTabId(chromeApi, tabSessionId),
      tabSessionId,
      sourceUrlInput,
      temporaryTab: false,
    };
  }

  if (!sourceUrlInput) {
    throw new CommandExecutionError(
      'Either tabSessionId or url is required',
      'missing_extraction_target',
      'validation',
      false,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrlInput);
  } catch {
    throw new CommandExecutionError('url must be a valid absolute URL', 'invalid_url', 'validation', false);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new CommandExecutionError('url must use http or https', 'invalid_url_scheme', 'validation', false);
  }

  const tab = await chromeApi.tabs.create({ url: parsed.toString(), active: false });
  if (!tab.id) {
    throw new CommandExecutionError('Failed to open temporary tab for URL extraction', 'tab_create_failed', 'validation', true);
  }

  return {
    tabId: tab.id,
    tabSessionId: null,
    sourceUrlInput: parsed.toString(),
    temporaryTab: true,
  };
}

async function extractRawHtml(chromeApi: ChromeLike, tabId: number, selector: string): Promise<{ html: string | null; sourceUrl: string; title: string | null }> {
  const result = await chromeApi.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const selected = document.querySelector(sel);
      const html = selected?.outerHTML ?? null;
      return {
        html,
        sourceUrl: window.location.href,
        title: document.title || null,
      };
    },
    args: [selector],
  });

  return (result[0]?.result as { html: string | null; sourceUrl: string; title: string | null } | undefined) ?? {
    html: null,
    sourceUrl: '',
    title: null,
  };
}

async function extractCleanHtml(chromeApi: ChromeLike, tabId: number, selector: string): Promise<{ html: string | null; sourceUrl: string; title: string | null }> {
  const result = await chromeApi.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const selected = document.querySelector(sel);
      if (!selected) {
        return {
          html: null,
          sourceUrl: window.location.href,
          title: document.title || null,
        };
      }

      const root = selected.cloneNode(true) as Element;

      // Remove script and style tags
      const toRemove = root.querySelectorAll('script, style, noscript');
      toRemove.forEach((el) => el.remove());

      // Remove all event handler attributes and clean up classes
      const allElements = root.querySelectorAll('*');
      allElements.forEach((el) => {
        // Remove all event handler attributes (onclick, onload, etc.)
        Array.from(el.attributes).forEach((attr) => {
          if (attr.name.startsWith('on')) {
            el.removeAttribute(attr.name);
          }
        });

        // Clean up class attribute: keep data-* and aria-* but remove obfuscated single-letter classes
        if (el.hasAttribute('class')) {
          const classes = el.getAttribute('class')?.split(/\s+/) || [];
          const cleaned = classes.filter(
            (cls) => cls.length > 1 || cls.length === 0 || /^[A-Z]/.test(cls),
          );
          if (cleaned.length > 0) {
            el.setAttribute('class', cleaned.join(' '));
          } else {
            el.removeAttribute('class');
          }
        }
      });

      return {
        html: root.outerHTML,
        sourceUrl: window.location.href,
        title: document.title || null,
      };
    },
    args: [selector],
  });

  return (result[0]?.result as { html: string | null; sourceUrl: string; title: string | null } | undefined) ?? {
    html: null,
    sourceUrl: '',
    title: null,
  };
}

async function extractDistilledArticle(
  chromeApi: ChromeLike,
  tabId: number,
  preferredMode: 'readability' | 'dom-distiller',
  fallbackToReadability: boolean,
): Promise<DistilledArticle> {
  const readabilityScriptUrl = chromeApi.runtime.getURL(READABILITY_SCRIPT_FILE);
  const domDistillerScriptUrl = chromeApi.runtime.getURL(DOM_DISTILLER_SCRIPT_FILE);

  async function runReadability(): Promise<{ article: DistilledArticle | null; failure?: DistillationFailure }> {
    try {
      for (let attempt = 1; attempt <= DISTILL_SCRIPT_INSTALL_MAX_ATTEMPTS; attempt += 1) {
        const result = await chromeApi.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: async (scriptUrl: string) => {
            const runtime = globalThis as {
              Readability?: new (doc: Document) => { parse: () => { content?: string; title?: string } | null };
              __ottoReadabilityLoadPromise?: Promise<void>;
            };

            async function ensureReadabilityLoaded(): Promise<void> {
              if (typeof runtime.Readability === 'function') {
                return;
              }

              if (!runtime.__ottoReadabilityLoadPromise) {
                runtime.__ottoReadabilityLoadPromise = new Promise((resolve, reject) => {
                  const existing = document.querySelector('script[data-otto-readability="1"]') as HTMLScriptElement | null;
                  if (existing) {
                    existing.addEventListener('load', () => resolve(), { once: true });
                    existing.addEventListener('error', () => reject(new Error('readability_script_load_failed')), { once: true });
                    return;
                  }

                  const script = document.createElement('script');
                  script.dataset.ottoReadability = '1';
                  script.src = scriptUrl;
                  script.async = false;
                  script.addEventListener('load', () => resolve(), { once: true });
                  script.addEventListener('error', () => reject(new Error('readability_script_load_failed')), { once: true });
                  (document.head || document.documentElement).appendChild(script);
                });
              }

              try {
                await runtime.__ottoReadabilityLoadPromise;
              } catch {
                runtime.__ottoReadabilityLoadPromise = undefined;
                throw new Error('readability_script_load_failed');
              }
            }

            try {
              await ensureReadabilityLoaded();
            } catch {
              return { kind: 'failure', reason: 'Readability script failed to load in page context' };
            }

            const ReadabilityCtor = runtime.Readability;
            if (typeof ReadabilityCtor !== 'function') {
              const injectedScript = document.querySelector('script[data-otto-readability="1"]') as HTMLScriptElement | null;
              const diagnostic = {
                hasScriptTag: Boolean(injectedScript),
                scriptSrc: injectedScript?.src ?? null,
                scriptReadyState: (injectedScript as HTMLScriptElement & { readyState?: string } | null)?.readyState ?? null,
                globalReadabilityType: typeof runtime.Readability,
                windowHasReadability: 'Readability' in window,
                windowReadabilityType: typeof (window as Window & { Readability?: unknown }).Readability,
                documentReadyState: document.readyState,
                locationHref: window.location.href,
              };
              return {
                kind: 'failure',
                reason: `Readability constructor is unavailable in page context ${JSON.stringify(diagnostic)}`,
              };
            }

            const article = new ReadabilityCtor(document).parse();
            if (!article || typeof article.content !== 'string' || article.content.trim().length === 0) {
              return { kind: 'failure', reason: 'Readability parse() produced no article content' };
            }

            return {
              kind: 'success',
              html: article.content,
              title: typeof article.title === 'string' ? article.title : (document.title || null),
              sourceUrl: window.location.href,
            };
          },
          args: [readabilityScriptUrl],
        });

        const payload = result[0]?.result as {
          kind?: unknown;
          reason?: unknown;
          html?: unknown;
          title?: unknown;
          sourceUrl?: unknown;
        } | null | undefined;

        const isLegacySuccess = payload
          && typeof payload.html === 'string'
          && typeof payload.sourceUrl === 'string';
        const isTaggedSuccess = payload
          && payload.kind === 'success'
          && typeof payload.html === 'string'
          && typeof payload.sourceUrl === 'string';

        if (!payload || (!isTaggedSuccess && !isLegacySuccess)) {
          const reason = payload && typeof payload.reason === 'string'
            ? payload.reason
            : 'unexpected readability script result shape';

          const constructorUnavailable = reason.startsWith('Readability constructor is unavailable in page context');
          if (constructorUnavailable) {
            if (attempt < DISTILL_SCRIPT_INSTALL_MAX_ATTEMPTS) {
              await wait(DISTILL_SCRIPT_INSTALL_RETRY_DELAY_MS);
              continue;
            }
            break;
          }

          return {
            article: null,
            failure: {
              mode: 'readability',
              reason,
            },
          };
        }

        const html = payload.html as string;
        const sourceUrl = payload.sourceUrl as string;

        return {
          article: {
            html,
            title: typeof payload.title === 'string' ? payload.title : null,
            sourceUrl,
            mode: 'readability',
            fallbackUsed: false,
          },
        };
      }

      const rawFallback = await chromeApi.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const root = document.querySelector('article, main') ?? document.body;
          const html = root?.outerHTML ?? '';
          if (!html || html.trim().length === 0) {
            return null;
          }
          return {
            html,
            title: document.title || null,
            sourceUrl: window.location.href,
          };
        },
      });

      const rawPayload = rawFallback[0]?.result as {
        html?: unknown;
        title?: unknown;
        sourceUrl?: unknown;
      } | null | undefined;

      if (rawPayload && typeof rawPayload.html === 'string' && typeof rawPayload.sourceUrl === 'string') {
        return {
          article: {
            html: rawPayload.html,
            title: typeof rawPayload.title === 'string' ? rawPayload.title : null,
            sourceUrl: rawPayload.sourceUrl,
            mode: 'readability',
            fallbackUsed: true,
          },
        };
      }

      return {
        article: null,
        failure: {
          mode: 'readability',
          reason: 'Readability constructor is unavailable in page context',
        },
      };
    } catch (error) {
      return {
        article: null,
        failure: {
          mode: 'readability',
          reason: `script execution error: ${summarizeError(error)}`,
        },
      };
    }
  }

  async function runDomDistiller(): Promise<{ article: DistilledArticle | null; failure?: DistillationFailure }> {
    try {
      for (let attempt = 1; attempt <= DISTILL_SCRIPT_INSTALL_MAX_ATTEMPTS; attempt += 1) {
        const result = await chromeApi.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: async (scriptUrl: string) => {
            const runtime = globalThis as {
              org?: {
                chromium?: {
                  distiller?: {
                    DomDistiller?: { apply: () => unknown };
                  };
                };
              };
              __ottoDomDistillerLoadPromise?: Promise<void>;
            };

            async function ensureDomDistillerLoaded(): Promise<void> {
              const applyFn = runtime.org?.chromium?.distiller?.DomDistiller?.apply;
              if (typeof applyFn === 'function') {
                return;
              }

              if (!runtime.__ottoDomDistillerLoadPromise) {
                runtime.__ottoDomDistillerLoadPromise = new Promise((resolve, reject) => {
                  const existing = document.querySelector('script[data-otto-dom-distiller="1"]') as HTMLScriptElement | null;
                  if (existing) {
                    existing.addEventListener('load', () => resolve(), { once: true });
                    existing.addEventListener('error', () => reject(new Error('dom_distiller_script_load_failed')), { once: true });
                    return;
                  }

                  const script = document.createElement('script');
                  script.dataset.ottoDomDistiller = '1';
                  script.src = scriptUrl;
                  script.async = false;
                  script.addEventListener('load', () => resolve(), { once: true });
                  script.addEventListener('error', () => reject(new Error('dom_distiller_script_load_failed')), { once: true });
                  (document.head || document.documentElement).appendChild(script);
                });
              }

              try {
                await runtime.__ottoDomDistillerLoadPromise;
              } catch {
                runtime.__ottoDomDistillerLoadPromise = undefined;
                throw new Error('dom_distiller_script_load_failed');
              }
            }

            try {
              await ensureDomDistillerLoaded();
            } catch {
              return { kind: 'failure', reason: 'DomDistiller script failed to load in page context' };
            }

            const chromiumNs = (globalThis as {
              org?: {
                chromium?: {
                  distiller?: {
                    DomDistiller?: { apply: () => unknown };
                  };
                };
              };
            }).org;
            const applyFn = chromiumNs?.chromium?.distiller?.DomDistiller?.apply;
            if (typeof applyFn !== 'function') {
              return { kind: 'failure', reason: 'DomDistiller.apply is unavailable in page context' };
            }

            const output = applyFn();
            let html: string | null = null;
            if (typeof output === 'string') {
              html = output;
            }
            if (!html && Array.isArray(output) && Array.isArray(output[2])) {
              const candidate = output[2][1];
              if (typeof candidate === 'string') {
                html = candidate;
              }
            }

            if (!html || html.trim().length === 0) {
              return { kind: 'failure', reason: 'dom-distiller returned no distilled HTML content' };
            }

            return {
              kind: 'success',
              html,
              title: document.title || null,
              sourceUrl: window.location.href,
            };
          },
          args: [domDistillerScriptUrl],
        });

        const payload = result[0]?.result as {
          kind?: unknown;
          reason?: unknown;
          html?: unknown;
          title?: unknown;
          sourceUrl?: unknown;
        } | null | undefined;
        const isLegacySuccess = payload
          && typeof payload.html === 'string'
          && typeof payload.sourceUrl === 'string';
        const isTaggedSuccess = payload
          && payload.kind === 'success'
          && typeof payload.html === 'string'
          && typeof payload.sourceUrl === 'string';

        if (!payload || (!isTaggedSuccess && !isLegacySuccess)) {
          const reason = payload && typeof payload.reason === 'string'
            ? payload.reason
            : 'unexpected dom-distiller script result shape';

          if (
            reason === 'DomDistiller.apply is unavailable in page context'
            && attempt < DISTILL_SCRIPT_INSTALL_MAX_ATTEMPTS
          ) {
            await wait(DISTILL_SCRIPT_INSTALL_RETRY_DELAY_MS);
            continue;
          }

          return {
            article: null,
            failure: {
              mode: 'dom-distiller',
              reason,
            },
          };
        }

        const html = payload.html as string;
        const sourceUrl = payload.sourceUrl as string;

        return {
          article: {
            html,
            title: typeof payload.title === 'string' ? payload.title : null,
            sourceUrl,
            mode: 'dom-distiller',
            fallbackUsed: false,
          },
        };
      }

      return {
        article: null,
        failure: {
          mode: 'dom-distiller',
          reason: 'DomDistiller.apply is unavailable in page context',
        },
      };
    } catch (error) {
      return {
        article: null,
        failure: {
          mode: 'dom-distiller',
          reason: `script execution error: ${summarizeError(error)}`,
        },
      };
    }
  }

  if (preferredMode === 'dom-distiller') {
    const domAttempt = await runDomDistiller();
    if (domAttempt.article) {
      return domAttempt.article;
    }
    if (!fallbackToReadability) {
      throw new CommandExecutionError(
        formatDistillationFailureMessage(
          'dom-distiller extraction failed and fallback is disabled',
          domAttempt.failure ? [domAttempt.failure] : [],
        ),
        'distiller_unavailable',
        'primitive.dom.extract_distilled_html',
        true,
      );
    }

    const readabilityAttempt = await runReadability();
    if (!readabilityAttempt.article) {
      throw new CommandExecutionError(
        formatDistillationFailureMessage(
          'Both dom-distiller and readability extraction failed',
          [domAttempt.failure, readabilityAttempt.failure].filter((value): value is DistillationFailure => Boolean(value)),
        ),
        'distillation_failed',
        'primitive.dom.extract_distilled_html',
        true,
      );
    }

    return {
      ...readabilityAttempt.article,
      fallbackUsed: true,
    };
  }

  const readabilityAttempt = await runReadability();
  if (!readabilityAttempt.article) {
    throw new CommandExecutionError(
      formatDistillationFailureMessage(
        'Readability extraction failed',
        readabilityAttempt.failure ? [readabilityAttempt.failure] : [],
      ),
      'readability_failed',
      'primitive.dom.extract_distilled_html',
      true,
    );
  }

  return readabilityAttempt.article;
}

async function convertHtmlToMarkdown(chromeApi: ChromeLike, tabId: number, html: string): Promise<string> {
  const result = await chromeApi.scripting.executeScript({
    target: { tabId },
    func: (sourceHtml: string) => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(sourceHtml, 'text/html');
        const root = doc.body;

        const removableSelectors = [
          'script',
          'style',
          'noscript',
          'template',
          'svg',
          'canvas',
          'iframe',
          'video',
          'audio',
          'form',
          'button',
          'input',
          'select',
          'textarea',
          'nav',
        ];
        for (const selector of removableSelectors) {
          for (const node of Array.from(root.querySelectorAll(selector))) {
            node.remove();
          }
        }

        for (const node of Array.from(root.querySelectorAll('[hidden], [aria-hidden="true"]'))) {
          node.remove();
        }

        const blockTags = new Set([
          'article', 'section', 'div', 'main', 'header', 'footer', 'aside', 'figure', 'figcaption',
          'p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
        ]);

        function decodeText(value: string): string {
          return value
            .replace(/\u00a0/g, ' ')
            .replace(/[\t\f\v ]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n');
        }

        function cleanInline(value: string): string {
          return decodeText(value)
            .replace(/[ ]+\n/g, '\n')
            .replace(/\n[ ]+/g, '\n')
            .replace(/ {2,}/g, ' ')
            .trim();
        }

        function cleanBlock(value: string): string {
          return value
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .trim();
        }

        function textFromNode(node: Node): string {
          if (node.nodeType === Node.TEXT_NODE) {
            return decodeText(node.textContent ?? '');
          }

          if (!(node instanceof Element)) {
            return '';
          }

          if (node.tagName.toLowerCase() === 'br') {
            return '\n';
          }

          return Array.from(node.childNodes).map((child) => textFromNode(child)).join('');
        }

        function renderChildren(node: Node, depth: number): string {
          return Array.from(node.childNodes).map((child) => renderNode(child, depth)).join('');
        }

        function renderListItem(node: Element, depth: number, ordered: boolean, index: number): string {
          const marker = ordered ? `${index + 1}. ` : '- ';
          const rendered = cleanBlock(renderChildren(node, depth + 1));
          if (!rendered) {
            return '';
          }

          const indented = rendered
            .split('\n')
            .map((line, lineIndex) => (lineIndex === 0 ? `${'  '.repeat(depth)}${marker}${line}` : `${'  '.repeat(depth + 1)}${line}`))
            .join('\n');
          return `${indented}\n`;
        }

        function renderNode(node: Node, depth = 0): string {
          if (node.nodeType === Node.TEXT_NODE) {
            return decodeText(node.textContent ?? '');
          }

          if (!(node instanceof Element)) {
            return '';
          }

          const tagName = node.tagName.toLowerCase();

          if (tagName === 'br') {
            return '\n';
          }

          if (tagName === 'hr') {
            return '\n\n---\n\n';
          }

          if (tagName === 'pre') {
            const code = node.textContent?.replace(/^\n+|\n+$/g, '') ?? '';
            if (!code) {
              return '';
            }
            return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
          }

          if (tagName === 'code') {
            const content = cleanInline(node.textContent ?? '');
            return content ? `\`${content}\`` : '';
          }

          if (tagName === 'strong' || tagName === 'b') {
            const content = cleanInline(renderChildren(node, depth));
            return content ? `**${content}**` : '';
          }

          if (tagName === 'em' || tagName === 'i') {
            const content = cleanInline(renderChildren(node, depth));
            return content ? `*${content}*` : '';
          }

          if (tagName === 'a') {
            const content = cleanInline(renderChildren(node, depth) || textFromNode(node));
            const href = node.getAttribute('href')?.trim() ?? '';
            if (!content) {
              return '';
            }
            if (!href || href.startsWith('javascript:') || href === '#') {
              return content;
            }
            return `[${content}](${href})`;
          }

          if (tagName === 'img') {
            const src = node.getAttribute('src')?.trim() ?? '';
            const alt = cleanInline(node.getAttribute('alt') ?? '');
            if (!src) {
              return alt;
            }
            return alt ? `![${alt}](${src})` : `![](${src})`;
          }

          if (/^h[1-6]$/.test(tagName)) {
            const level = Number(tagName.slice(1));
            const content = cleanInline(renderChildren(node, depth));
            return content ? `\n\n${'#'.repeat(level)} ${content}\n\n` : '';
          }

          if (tagName === 'blockquote') {
            const content = cleanBlock(renderChildren(node, depth));
            if (!content) {
              return '';
            }
            return `\n\n${content.split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
          }

          if (tagName === 'ul' || tagName === 'ol') {
            const items = Array.from(node.children)
              .filter((child) => child.tagName.toLowerCase() === 'li')
              .map((child, index) => renderListItem(child, depth, tagName === 'ol', index))
              .join('');
            return items ? `\n${items}\n` : '';
          }

          if (tagName === 'table') {
            const rows = Array.from(node.querySelectorAll('tr')).map((row) => {
              const cells = Array.from(row.querySelectorAll('th, td'))
                .map((cell) => cleanInline(textFromNode(cell)))
                .filter(Boolean);
              return cells.join(' | ');
            }).filter(Boolean);
            return rows.length > 0 ? `\n\n${rows.join('\n')}\n\n` : '';
          }

          const content = blockTags.has(tagName)
            ? cleanBlock(renderChildren(node, depth))
            : renderChildren(node, depth);

          if (!content) {
            return '';
          }

          if (blockTags.has(tagName)) {
            return `\n\n${content}\n\n`;
          }

          return content;
        }

        const markdown = cleanBlock(renderChildren(root, 0))
          .replace(/\n{3,}/g, '\n\n');

        return markdown.length > 0 ? markdown : null;
      } catch {
        return null;
      }
    },
    args: [html],
  });

  const markdown = result[0]?.result;
  if (typeof markdown !== 'string') {
    const fallback = await chromeApi.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (sourceHtml: string) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(sourceHtml, 'text/html');
          return (doc.body?.textContent ?? '').trim();
        } catch {
          return null;
        }
      },
      args: [html],
    });

    const fallbackText = fallback[0]?.result;
    if (typeof fallbackText === 'string') {
      return fallbackText;
    }

    throw new CommandExecutionError(
      'Failed to convert distilled HTML to markdown',
      'markdown_conversion_failed',
      'primitive.dom.extract_markdown',
      true,
    );
  }

  return markdown;
}

export async function resolveTabId(chromeApi: ChromeLike, tabSessionId: string | undefined): Promise<number> {
  if (!tabSessionId) {
    throw new CommandExecutionError('tabSessionId is required for this action', 'missing_tab_session', 'validation', false);
  }

  const sessions = await getTabSessions(chromeApi);
  const tabId = sessions[tabSessionId];
  if (!tabId) {
    throw new CommandExecutionError(`Unknown tabSessionId: ${tabSessionId}`, 'unknown_tab_session', 'resolve_tab', false);
  }

  try {
    await chromeApi.tabs.get(tabId);
  } catch {
    delete sessions[tabSessionId];
    const tabSessionOwners = await getTabSessionOwners(chromeApi);
    delete tabSessionOwners[tabSessionId];
    await Promise.all([
      saveTabSessions(chromeApi, sessions),
      saveTabSessionOwners(chromeApi, tabSessionOwners),
    ]);
    throw new CommandExecutionError(`Tab for tabSessionId is no longer available: ${tabSessionId}`, 'tab_session_closed', 'resolve_tab', true);
  }

  return tabId;
}

export async function executeCommand(chromeApi: ChromeLike, command: CommandPayload): Promise<CommandExecutionResult> {
  const start = Date.now();
  const debuggerFocusEmulationManager = getDebuggerFocusEmulationManager(chromeApi);

  switch (command.action) {
    case 'primitive.tab.open': {
      const url = String(command.payload.url ?? 'about:blank');
      const controllerClientId = typeof command.payload.__controllerClientId === 'string'
        ? command.payload.__controllerClientId
        : undefined;
      const tab = await chromeApi.tabs.create({ url, active: false });
      if (!tab.id || tab.windowId === undefined) {
        throw new CommandExecutionError('Failed to create tab', 'tab_create_failed', 'primitive.tab.open', true);
      }

      await attachTabToAutomationGroup(chromeApi, tab.id);

      const tabSessionId = `tab_${nanoid(10)}`;
      const tabSessions = await getTabSessions(chromeApi);
      tabSessions[tabSessionId] = tab.id;
      const tabSessionOwners = await getTabSessionOwners(chromeApi);
      if (controllerClientId) {
        tabSessionOwners[tabSessionId] = controllerClientId;
      }
      await Promise.all([
        saveTabSessions(chromeApi, tabSessions),
        saveTabSessionOwners(chromeApi, tabSessionOwners),
      ]);

      return {
        durationMs: Date.now() - start,
        data: { tabId: tab.id, tabSessionId, url },
      };
    }
    case 'primitive.tab.close': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const tabSessions = await getTabSessions(chromeApi);
      const tabSessionOwners = await getTabSessionOwners(chromeApi);
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      await debuggerFocusEmulationManager.stopForTab(tabId);
      await chromeApi.tabs.remove(tabId);
      delete tabSessions[tabSessionId];
      delete tabSessionOwners[tabSessionId];
      await Promise.all([
        saveTabSessions(chromeApi, tabSessions),
        saveTabSessionOwners(chromeApi, tabSessionOwners),
      ]);
      return {
        durationMs: Date.now() - start,
        data: { closed: true, tabSessionId },
      };
    }
    case 'primitive.tab.close_owned': {
      const controllerClientId = String(command.payload.controllerClientId ?? '').trim();
      if (!controllerClientId) {
        throw new CommandExecutionError('controllerClientId is required', 'missing_controller_client_id', 'validation', false);
      }

      const tabSessions = await getTabSessions(chromeApi);
      const tabSessionOwners = await getTabSessionOwners(chromeApi);
      const tabSessionIds = Object.keys(tabSessions).filter((tabSessionId) => tabSessionOwners[tabSessionId] === controllerClientId);

      let closedCount = 0;
      let missingCount = 0;

      for (const tabSessionId of tabSessionIds) {
        const tabId = tabSessions[tabSessionId];
        await debuggerFocusEmulationManager.stopForTab(tabId);
        try {
          await chromeApi.tabs.remove(tabId);
          closedCount += 1;
        } catch {
          missingCount += 1;
        }
        delete tabSessions[tabSessionId];
        delete tabSessionOwners[tabSessionId];
      }

      await Promise.all([
        saveTabSessions(chromeApi, tabSessions),
        saveTabSessionOwners(chromeApi, tabSessionOwners),
      ]);

      return {
        durationMs: Date.now() - start,
        data: {
          controllerClientId,
          closedCount,
          missingCount,
          totalOwnedSessions: tabSessionIds.length,
        },
      };
    }
    case 'primitive.tab.navigate': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const url = String(command.payload.url ?? 'about:blank');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      await chromeApi.tabs.update(tabId, { url });
      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, url },
      };
    }
    case 'primitive.tab.query': {
      const tabSessions = await getTabSessions(chromeApi);
      return {
        durationMs: Date.now() - start,
        data: { tabSessions },
      };
    }
    case 'primitive.dom.extract_text': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const selector = String(command.payload.selector ?? 'body');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      const result = await chromeApi.scripting.executeScript({
        target: { tabId },
        func: (sel: string) => {
          const el = document.querySelector(sel);
          return el?.textContent?.trim() ?? null;
        },
        args: [selector],
      });
      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, selector, text: result[0]?.result ?? null },
      };
    }
    case 'primitive.dom.extract_html': {
      const target = await resolveExtractionTarget(chromeApi, command);
      const selector = String(command.payload.selector ?? 'body');
      const maxChars = readNumberInRange(command.payload.maxChars, 500_000, 1_000, 5_000_000);
      try {
        await ensureTemporaryExtractionTabReady(chromeApi, target, 'primitive.dom.extract_html');
        const extracted = await extractRawHtml(chromeApi, target.tabId, selector);
        const html = typeof extracted.html === 'string'
          ? applyContentLimit(extracted.html, maxChars)
          : null;

        return {
          durationMs: Date.now() - start,
          data: {
            tabSessionId: target.tabSessionId,
            sourceUrl: extracted.sourceUrl || target.sourceUrlInput,
            title: extracted.title,
            extractionMode: 'raw_html',
            selector,
            fallbackUsed: false,
            contentLength: html?.length ?? 0,
            content: html,
          },
        };
      } finally {
        if (target.temporaryTab) {
          try {
            await chromeApi.tabs.remove(target.tabId);
          } catch {
            // Best-effort cleanup for temporary extraction tabs.
          }
        }
      }
    }
    case 'primitive.dom.extract_clean_html': {
      const target = await resolveExtractionTarget(chromeApi, command);
      const selector = String(command.payload.selector ?? 'body');
      const maxChars = readNumberInRange(command.payload.maxChars, 500_000, 1_000, 5_000_000);
      try {
        await ensureTemporaryExtractionTabReady(chromeApi, target, 'primitive.dom.extract_clean_html');
        const extracted = await extractCleanHtml(chromeApi, target.tabId, selector);
        const html = typeof extracted.html === 'string'
          ? applyContentLimit(extracted.html, maxChars)
          : null;

        return {
          durationMs: Date.now() - start,
          data: {
            tabSessionId: target.tabSessionId,
            sourceUrl: extracted.sourceUrl || target.sourceUrlInput,
            title: extracted.title,
            extractionMode: 'clean_html',
            selector,
            fallbackUsed: false,
            contentLength: html?.length ?? 0,
            content: html,
          },
        };
      } finally {
        if (target.temporaryTab) {
          try {
            await chromeApi.tabs.remove(target.tabId);
          } catch {
            // Best-effort cleanup for temporary extraction tabs.
          }
        }
      }
    }
    case 'primitive.dom.extract_distilled_html': {
      const target = await resolveExtractionTarget(chromeApi, command);
      const preferredMode = String(command.payload.mode ?? 'readability').trim().toLowerCase() === 'dom-distiller'
        ? 'dom-distiller'
        : 'readability';
      const fallbackToReadability = command.payload.fallbackToReadability === undefined
        ? true
        : Boolean(command.payload.fallbackToReadability);
      const maxChars = readNumberInRange(command.payload.maxChars, 500_000, 1_000, 5_000_000);

      try {
        await ensureTemporaryExtractionTabReady(chromeApi, target, 'primitive.dom.extract_distilled_html');
        const distilled = await extractDistilledArticle(chromeApi, target.tabId, preferredMode, fallbackToReadability);
        const limited = applyContentLimit(distilled.html, maxChars);
        return {
          durationMs: Date.now() - start,
          data: {
            tabSessionId: target.tabSessionId,
            sourceUrl: distilled.sourceUrl || target.sourceUrlInput,
            title: distilled.title,
            extractionMode: distilled.mode,
            fallbackUsed: distilled.fallbackUsed,
            contentLength: limited.length,
            content: limited,
          },
        };
      } finally {
        if (target.temporaryTab) {
          try {
            await chromeApi.tabs.remove(target.tabId);
          } catch {
            // Best-effort cleanup for temporary extraction tabs.
          }
        }
      }
    }
    case 'primitive.dom.extract_markdown': {
      const target = await resolveExtractionTarget(chromeApi, command);
      const preferredMode = String(command.payload.mode ?? 'readability').trim().toLowerCase() === 'dom-distiller'
        ? 'dom-distiller'
        : 'readability';
      const fallbackToReadability = command.payload.fallbackToReadability === undefined
        ? true
        : Boolean(command.payload.fallbackToReadability);
      const maxChars = readNumberInRange(command.payload.maxChars, 250_000, 1_000, 2_000_000);

      try {
        await ensureTemporaryExtractionTabReady(chromeApi, target, 'primitive.dom.extract_markdown');
        const distilled = await extractDistilledArticle(chromeApi, target.tabId, preferredMode, fallbackToReadability);
        const markdown = await convertHtmlToMarkdown(chromeApi, target.tabId, distilled.html);
        const limited = applyContentLimit(markdown, maxChars);

        return {
          durationMs: Date.now() - start,
          data: {
            tabSessionId: target.tabSessionId,
            sourceUrl: distilled.sourceUrl || target.sourceUrlInput,
            title: distilled.title,
            extractionMode: distilled.mode,
            fallbackUsed: distilled.fallbackUsed,
            contentLength: limited.length,
            content: limited,
          },
        };
      } finally {
        if (target.temporaryTab) {
          try {
            await chromeApi.tabs.remove(target.tabId);
          } catch {
            // Best-effort cleanup for temporary extraction tabs.
          }
        }
      }
    }
    case 'primitive.page.screenshot': {
      const target = await resolveExtractionTarget(chromeApi, command);
      const screenshot = parseScreenshotPayload(command);
      let quality = screenshot.quality;
      let scale = 1;
      let downscaled = false;
      let capture: ScreenshotCaptureResult | null = null;

      try {
        await ensureTemporaryExtractionTabReady(chromeApi, target, 'primitive.page.screenshot');
        if (!target.temporaryTab) {
          await waitForExtractionTabReady(chromeApi, target.tabId);
        }

        for (let attempt = 1; attempt <= SCREENSHOT_MAX_CAPTURE_ATTEMPTS; attempt += 1) {
          capture = screenshot.mode === 'full_page'
            ? await captureFullPageScreenshot(chromeApi, target.tabId, screenshot.format, quality, scale)
            : await captureViewportScreenshot(chromeApi, target.tabId, screenshot.format, quality);

          if (capture.byteLength <= screenshot.maxBytes) {
            break;
          }

          if (attempt === SCREENSHOT_MAX_CAPTURE_ATTEMPTS) {
            break;
          }

          if (screenshot.format === 'jpeg' && quality > SCREENSHOT_MIN_JPEG_QUALITY) {
            const nextQuality = nextScreenshotQuality(quality);
            if (nextQuality !== quality) {
              quality = nextQuality;
              downscaled = true;
              continue;
            }
          }

          if (screenshot.mode === 'full_page' && scale > SCREENSHOT_MIN_SCALE) {
            const nextScale = nextScreenshotScale(scale);
            if (nextScale !== scale) {
              scale = nextScale;
              downscaled = true;
              continue;
            }
          }

          break;
        }

        if (!capture) {
          throw new CommandExecutionError(
            'Screenshot capture did not return any image payload',
            'screenshot_capture_failed',
            'primitive.page.screenshot',
            true,
          );
        }

        if (capture.byteLength > screenshot.maxBytes) {
          throw new CommandExecutionError(
            `Screenshot payload exceeds maxBytes (${capture.byteLength} > ${screenshot.maxBytes})`,
            'screenshot_too_large',
            'primitive.page.screenshot',
            false,
          );
        }

        const sourceUrl = await getTabSourceUrl(chromeApi, target.tabId, target.sourceUrlInput);

        return {
          durationMs: Date.now() - start,
          data: {
            tabSessionId: target.tabSessionId,
            sourceUrl,
            mode: screenshot.mode,
            format: screenshot.format,
            mimeType: capture.mimeType,
            width: capture.width,
            height: capture.height,
            byteLength: capture.byteLength,
            maxBytes: screenshot.maxBytes,
            quality: capture.quality,
            scale: capture.scale,
            downscaled,
            contentBase64: capture.contentBase64,
          },
        };
      } finally {
        if (target.temporaryTab) {
          try {
            await chromeApi.tabs.remove(target.tabId);
          } catch {
            // Best-effort cleanup for temporary screenshot tabs.
          }
        }
      }
    }
    case 'command.list': {
      return {
        durationMs: Date.now() - start,
        data: { commands: listCommandsForRuntime() },
      };
    }
    case 'command.run':
    case 'command.reddit_posts': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      const data = await runCommandAction(chromeApi, command, tabId, tabSessionId);
      const payload = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : { result: data };

      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, ...payload },
      };
    }
    case 'command.test': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      const data = await runCommandTestAction(chromeApi, command, tabId, tabSessionId);
      const payload = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : { result: data };

      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, ...payload },
      };
    }
    case 'listener.subscribe': {
      const listener = String(command.payload.listener ?? '').trim();
      if (!listener) {
        throw new CommandExecutionError('listener is required', 'missing_listener_name', 'validation', false);
      }

      const rawOptions = (command.payload.options ?? {}) as Record<string, unknown>;
      let options = rawOptions;

      if (listener === 'network.http_intercept') {
        const tabSessionId = String(rawOptions.tabSessionId ?? command.payload.tabSessionId ?? command.tabSessionId ?? '').trim();
        if (!tabSessionId) {
          throw new CommandExecutionError(
            'network listener requires options.tabSessionId',
            'missing_tab_session',
            'validation',
            false,
          );
        }

        const site = String(rawOptions.site ?? '').trim().toLowerCase();
        if (!site) {
          throw new CommandExecutionError(
            'network listener requires options.site',
            'missing_site',
            'validation',
            false,
          );
        }

        const mode = String(rawOptions.mode ?? 'network').trim().toLowerCase();
        if (!['network', 'fetch', 'hybrid'].includes(mode)) {
          throw new CommandExecutionError(
            'network listener mode must be network|fetch|hybrid',
            'invalid_listener_mode',
            'validation',
            false,
          );
        }

        const maxBodyBytesValue = rawOptions.maxBodyBytes;
        let normalizedMaxBodyBytes: number | undefined;
        if (maxBodyBytesValue !== undefined) {
          const maxBodyBytes = Number(maxBodyBytesValue);
          if (!Number.isFinite(maxBodyBytes) || maxBodyBytes <= 0) {
            throw new CommandExecutionError(
              'network listener maxBodyBytes must be a positive number',
              'invalid_listener_max_body_bytes',
              'validation',
              false,
            );
          }
          normalizedMaxBodyBytes = Math.floor(maxBodyBytes);
        }

        if (rawOptions.urlPatterns !== undefined && !Array.isArray(rawOptions.urlPatterns)) {
          throw new CommandExecutionError(
            'network listener urlPatterns must be an array of strings',
            'invalid_listener_url_patterns',
            'validation',
            false,
          );
        }

        if (Array.isArray(rawOptions.urlPatterns) && rawOptions.urlPatterns.some((value) => typeof value !== 'string')) {
          throw new CommandExecutionError(
            'network listener urlPatterns must be an array of strings',
            'invalid_listener_url_patterns',
            'validation',
            false,
          );
        }

        if (rawOptions.mimeTypes !== undefined && !Array.isArray(rawOptions.mimeTypes)) {
          throw new CommandExecutionError(
            'network listener mimeTypes must be an array of strings',
            'invalid_listener_mime_types',
            'validation',
            false,
          );
        }

        if (rawOptions.includeBody !== undefined && typeof rawOptions.includeBody !== 'boolean') {
          throw new CommandExecutionError(
            'network listener includeBody must be a boolean',
            'invalid_listener_include_body',
            'validation',
            false,
          );
        }

        if (rawOptions.includeHeaders !== undefined && typeof rawOptions.includeHeaders !== 'boolean') {
          throw new CommandExecutionError(
            'network listener includeHeaders must be a boolean',
            'invalid_listener_include_headers',
            'validation',
            false,
          );
        }

        if (Array.isArray(rawOptions.mimeTypes) && rawOptions.mimeTypes.some((value) => typeof value !== 'string')) {
          throw new CommandExecutionError(
            'network listener mimeTypes must be an array of strings',
            'invalid_listener_mime_types',
            'validation',
            false,
          );
        }

        if (rawOptions.requestHostAllowlist !== undefined && !Array.isArray(rawOptions.requestHostAllowlist)) {
          throw new CommandExecutionError(
            'network listener requestHostAllowlist must be an array of strings',
            'invalid_listener_request_hosts',
            'validation',
            false,
          );
        }

        if (
          Array.isArray(rawOptions.requestHostAllowlist)
          && rawOptions.requestHostAllowlist.some((value) => typeof value !== 'string')
        ) {
          throw new CommandExecutionError(
            'network listener requestHostAllowlist must be an array of strings',
            'invalid_listener_request_hosts',
            'validation',
            false,
          );
        }

        const requestHostAllowlist = Array.isArray(rawOptions.requestHostAllowlist)
          ? Array.from(new Set(
            rawOptions.requestHostAllowlist
              .map((value) => String(value).trim().toLowerCase())
              .filter((value) => value.length > 0),
          ))
          : undefined;

        const urlPatterns = Array.isArray(rawOptions.urlPatterns)
          ? Array.from(new Set(
            rawOptions.urlPatterns
              .map((value) => String(value).trim())
              .filter((value) => value.length > 0),
          ))
          : undefined;

        const mimeTypes = Array.isArray(rawOptions.mimeTypes)
          ? Array.from(new Set(
            rawOptions.mimeTypes
              .map((value) => String(value).trim().toLowerCase())
              .filter((value) => value.length > 0),
          ))
          : undefined;

        const includeBody = typeof rawOptions.includeBody === 'boolean'
          ? rawOptions.includeBody
          : undefined;

        const includeHeaders = typeof rawOptions.includeHeaders === 'boolean'
          ? rawOptions.includeHeaders
          : undefined;

        let streamAdapter: string | undefined;
        if (rawOptions.streamAdapter !== undefined) {
          if (typeof rawOptions.streamAdapter !== 'string') {
            throw new CommandExecutionError(
              'network listener streamAdapter must be a string',
              'invalid_listener_stream_adapter',
              'validation',
              false,
            );
          }
          const normalized = rawOptions.streamAdapter.trim();
          if (normalized.length === 0) {
            throw new CommandExecutionError(
              'network listener streamAdapter must not be empty',
              'invalid_listener_stream_adapter',
              'validation',
              false,
            );
          }
          streamAdapter = normalized;
        }

        let selfUserId: string | undefined;
        if (rawOptions.selfUserId !== undefined) {
          if (typeof rawOptions.selfUserId !== 'string') {
            throw new CommandExecutionError(
              'network listener selfUserId must be a string',
              'invalid_listener_self_user_id',
              'validation',
              false,
            );
          }
          const normalized = rawOptions.selfUserId.trim();
          if (normalized.length > 0) {
            selfUserId = normalized;
          }
        }

        options = {
          tabSessionId,
          site,
          mode,
          ...(urlPatterns ? { urlPatterns } : {}),
          ...(mimeTypes ? { mimeTypes } : {}),
          ...(normalizedMaxBodyBytes !== undefined ? { maxBodyBytes: normalizedMaxBodyBytes } : {}),
          ...(includeBody !== undefined ? { includeBody } : {}),
          ...(includeHeaders !== undefined ? { includeHeaders } : {}),
          ...(requestHostAllowlist ? { requestHostAllowlist } : {}),
          ...(streamAdapter !== undefined ? { streamAdapter } : {}),
          ...(selfUserId !== undefined ? { selfUserId } : {}),
        };
      }

      return {
        durationMs: Date.now() - start,
        data: {
          listener,
          subscribed: true,
          options,
        },
      };
    }
    case 'listener.unsubscribe': {
      const targetRequestId = String(command.payload.targetRequestId ?? '').trim();
      if (!targetRequestId) {
        throw new CommandExecutionError(
          'targetRequestId is required',
          'missing_listener_target_request',
          'validation',
          false,
        );
      }

      return {
        durationMs: Date.now() - start,
        data: {
          targetRequestId,
          unsubscribed: true,
        },
      };
    }
    default:
      throw new CommandExecutionError(`Unsupported action: ${command.action}`, 'unsupported_action', 'validation', false);
  }
}
