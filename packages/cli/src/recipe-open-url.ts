type RecipeDescriptorLike = {
  site?: string;
  id?: string;
  preloadHost?: string;
};

function normalizeHostLike(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return trimmed.toLowerCase().replace(/^www\./, '');
  }
}

function toHttpsUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function resolveRecipeAutoOpenUrl(
  siteArg: string,
  recipeId: string,
  descriptors: RecipeDescriptorLike[],
): string {
  const defaultUrl = toHttpsUrl(siteArg);
  const matchedDescriptor = resolveRecipeDescriptor(siteArg, recipeId, descriptors);

  const preloadHost = String(matchedDescriptor?.preloadHost ?? '').trim();
  if (!preloadHost) {
    return defaultUrl;
  }

  return toHttpsUrl(preloadHost);
}

export function resolveRecipeDescriptor(
  siteArg: string,
  recipeId: string,
  descriptors: RecipeDescriptorLike[],
): RecipeDescriptorLike | undefined {
  const normalizedSite = normalizeHostLike(siteArg);

  return descriptors.find((descriptor) => {
    const descriptorSite = normalizeHostLike(String(descriptor.site ?? ''));
    const descriptorId = String(descriptor.id ?? '').trim();
    return descriptorSite === normalizedSite && descriptorId === recipeId;
  });
}
