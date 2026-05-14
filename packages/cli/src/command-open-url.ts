type CommandDescriptorLike = {
  site?: string;
  id?: string;
  preloadHost?: string;
};

export function normalizeHostLike(value: string): string {
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

export function toHttpsUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function resolveCommandAutoOpenUrl(
  siteArg: string,
  commandId: string,
  descriptors: CommandDescriptorLike[],
): string {
  const matchedDescriptor = resolveCommandDescriptor(siteArg, commandId, descriptors);

  const preloadHost = String(matchedDescriptor?.preloadHost ?? '').trim();
  if (preloadHost) {
    return toHttpsUrl(preloadHost);
  }
  // If no preloadHost, default to the site itself
  const site = String(matchedDescriptor?.site ?? siteArg).trim();
  if (site) {
    return toHttpsUrl(site);
  }
  // Fallback to about:blank only if site is missing
  return 'about:blank';
}

export function resolveCommandDescriptor(
  siteArg: string,
  commandId: string,
  descriptors: CommandDescriptorLike[],
): CommandDescriptorLike | undefined {
  const normalizedSite = normalizeHostLike(siteArg);

  return descriptors.find((descriptor) => {
    const descriptorSite = normalizeHostLike(String(descriptor.site ?? ''));
    const descriptorId = String(descriptor.id ?? '').trim();
    return descriptorSite === normalizedSite && descriptorId === commandId;
  });
}
