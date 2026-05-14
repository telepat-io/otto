export type ExtractContentFormat = 'markdown' | 'distilled_html' | 'clean_html' | 'raw_html' | 'text';

export type ExtractDistillMode = 'readability' | 'dom-distiller';

export interface BuildExtractContentRequestInput {
  format?: string;
  url?: string;
  tabSessionId?: string;
  selector?: string;
  maxChars?: number;
  distillMode?: string;
  fallbackToReadability?: boolean;
}

export interface ExtractContentRequest {
  format: ExtractContentFormat;
  action: string;
  tabSessionId?: string;
  payload: Record<string, unknown>;
  requiresTemporaryTextTab: boolean;
}

const EXTRACT_FORMATS: ExtractContentFormat[] = ['markdown', 'distilled_html', 'clean_html', 'raw_html', 'text'];

export function parseExtractContentFormat(value: unknown): ExtractContentFormat {
  const format = String(value ?? 'markdown').trim().toLowerCase();
  if (!EXTRACT_FORMATS.includes(format as ExtractContentFormat)) {
    throw new Error('--format must be one of markdown|distilled_html|clean_html|raw_html|text');
  }
  return format as ExtractContentFormat;
}

export function parseDistillMode(value: unknown): ExtractDistillMode {
  const mode = String(value ?? 'readability').trim().toLowerCase();
  if (mode === 'dom-distiller') {
    return 'dom-distiller';
  }
  if (mode === 'readability') {
    return 'readability';
  }
  throw new Error('--distill-mode must be one of readability|dom-distiller');
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function buildExtractContentRequest(input: BuildExtractContentRequestInput): ExtractContentRequest {
  const format = parseExtractContentFormat(input.format);
  const url = normalizeOptionalString(input.url);
  const tabSessionId = normalizeOptionalString(input.tabSessionId);
  const selector = normalizeOptionalString(input.selector);

  if (!url && !tabSessionId) {
    throw new Error('Provide a URL argument or --tab-session for extraction');
  }

  if ((format === 'markdown' || format === 'distilled_html') && selector) {
    throw new Error('--selector is only supported for raw_html, clean_html, or text extraction');
  }

  if ((format === 'raw_html' || format === 'clean_html' || format === 'text') && input.distillMode !== undefined) {
    throw new Error('--distill-mode is only supported for markdown or distilled_html extraction');
  }

  if ((format === 'raw_html' || format === 'clean_html' || format === 'text') && input.fallbackToReadability !== undefined) {
    throw new Error('--fallback-to-readability is only supported for markdown or distilled_html extraction');
  }

  if (format === 'text' && input.maxChars !== undefined) {
    throw new Error('--max-chars is not supported for text extraction');
  }

  if (format === 'text') {
    const resolvedTabSessionId = tabSessionId;
    return {
      format,
      action: 'primitive.dom.extract_text',
      tabSessionId: resolvedTabSessionId,
      payload: {
        ...(resolvedTabSessionId ? { tabSessionId: resolvedTabSessionId } : {}),
        selector: selector ?? 'body',
      },
      requiresTemporaryTextTab: !resolvedTabSessionId,
    };
  }

  if (format === 'raw_html') {
    return {
      format,
      action: 'primitive.dom.extract_html',
      tabSessionId,
      payload: {
        ...(tabSessionId ? { tabSessionId } : {}),
        ...(url ? { url } : {}),
        selector: selector ?? 'body',
        ...(input.maxChars !== undefined ? { maxChars: input.maxChars } : {}),
      },
      requiresTemporaryTextTab: false,
    };
  }

  if (format === 'clean_html') {
    return {
      format,
      action: 'primitive.dom.extract_clean_html',
      tabSessionId,
      payload: {
        ...(tabSessionId ? { tabSessionId } : {}),
        ...(url ? { url } : {}),
        selector: selector ?? 'body',
        ...(input.maxChars !== undefined ? { maxChars: input.maxChars } : {}),
      },
      requiresTemporaryTextTab: false,
    };
  }

  const action = format === 'markdown'
    ? 'primitive.dom.extract_markdown'
    : 'primitive.dom.extract_distilled_html';

  return {
    format,
    action,
    tabSessionId,
    payload: {
      ...(tabSessionId ? { tabSessionId } : {}),
      ...(url ? { url } : {}),
      mode: parseDistillMode(input.distillMode ?? 'readability'),
      fallbackToReadability: input.fallbackToReadability ?? true,
      ...(input.maxChars !== undefined ? { maxChars: input.maxChars } : {}),
    },
    requiresTemporaryTextTab: false,
  };
}