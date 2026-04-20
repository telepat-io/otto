export type PageDeepQuerySelector = (root: ParentNode, selector: string) => Element | null;

export type PageDeepQuerySelectorAll = (root: ParentNode, selector: string) => Element[];

export type PageSerializedScriptError = {
  __ottoSerializedCommandError: true;
  code: string;
  message: string;
  diagnostics?: Record<string, unknown>;
};

export type PageSerializeScriptError = (
  error: unknown,
  fallbackCode: string,
  diagnostics?: Record<string, unknown>,
) => PageSerializedScriptError;

type OttoPageDomWindow = Window & {
  __ottoDeepQuerySelector?: PageDeepQuerySelector;
  __ottoDeepQuerySelectorAll?: PageDeepQuerySelectorAll;
  __ottoSerializeScriptError?: PageSerializeScriptError;
};

export function installPageDomQueryHelpers(): void {
  const pageWindow = window as OttoPageDomWindow;
  if (
    typeof pageWindow.__ottoDeepQuerySelector === 'function'
    && typeof pageWindow.__ottoDeepQuerySelectorAll === 'function'
    && typeof pageWindow.__ottoSerializeScriptError === 'function'
  ) {
    return;
  }

  const deepQuerySelector: PageDeepQuerySelector = (root, selector) => {
    const found = root.querySelector(selector);
    if (found) {
      return found;
    }

    for (const element of Array.from(root.querySelectorAll('*'))) {
      if (!element.shadowRoot) {
        continue;
      }
      const nested = deepQuerySelector(element.shadowRoot, selector);
      if (nested) {
        return nested;
      }
    }

    return null;
  };

  const deepQuerySelectorAll: PageDeepQuerySelectorAll = (root, selector) => {
    const matches = Array.from(root.querySelectorAll(selector));
    for (const element of Array.from(root.querySelectorAll('*'))) {
      if (!element.shadowRoot) {
        continue;
      }
      matches.push(...deepQuerySelectorAll(element.shadowRoot, selector));
    }
    return matches;
  };

  const serializeScriptError: PageSerializeScriptError = (error, fallbackCode, diagnostics) => {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : fallbackCode;
    const messageCode = message.includes(':') ? message.slice(0, message.indexOf(':')).trim() : '';
    const code = messageCode || fallbackCode;

    return {
      __ottoSerializedCommandError: true,
      code,
      message,
      diagnostics,
    };
  };

  pageWindow.__ottoDeepQuerySelector = deepQuerySelector;
  pageWindow.__ottoDeepQuerySelectorAll = deepQuerySelectorAll;
  pageWindow.__ottoSerializeScriptError = serializeScriptError;
}
