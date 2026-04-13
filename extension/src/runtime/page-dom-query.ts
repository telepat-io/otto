export type PageDeepQuerySelector = (root: ParentNode, selector: string) => Element | null;

export type PageDeepQuerySelectorAll = (root: ParentNode, selector: string) => Element[];

type OttoPageDomWindow = Window & {
  __ottoDeepQuerySelector?: PageDeepQuerySelector;
  __ottoDeepQuerySelectorAll?: PageDeepQuerySelectorAll;
};

export function installPageDomQueryHelpers(): void {
  const pageWindow = window as OttoPageDomWindow;
  if (
    typeof pageWindow.__ottoDeepQuerySelector === 'function'
    && typeof pageWindow.__ottoDeepQuerySelectorAll === 'function'
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

  pageWindow.__ottoDeepQuerySelector = deepQuerySelector;
  pageWindow.__ottoDeepQuerySelectorAll = deepQuerySelectorAll;
}
