type CommandDescriptorLike = {
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

export function resolveCommandAutoOpenUrl(
  siteArg: string,
  commandId: string,
  descriptors: CommandDescriptorLike[],
): string {
  const defaultUrl = toHttpsUrl(siteArg);
  const matchedDescriptor = resolveCommandDescriptor(siteArg, commandId, descriptors);

  const preloadHost = String(matchedDescriptor?.preloadHost ?? '').trim();
  if (!preloadHost) {
    return defaultUrl;
  }

  return toHttpsUrl(preloadHost);
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
