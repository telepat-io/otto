import { showTerminalErrorAlert } from '../tui.js';

export {
  parseJsonObject,
  isJsonOutput,
  logJsonAware,
  parseMaybeNumber,
  parsePositiveNumberOption,
  parseNetworkMode,
  collectString,
  normalizeControllerName,
  normalizeControllerDescription,
  promptControllerMetadata,
  resolveControllerRegistrationMetadata,
  showAclMissingGrantHint,
  type ControllerRegistrationMetadata,
} from './input-utils-pure.js';

export async function showTestFailureFooterAlert(
  errorPayload?: { message?: string; code?: string; action?: string },
  title = 'otto test failed',
): Promise<void> {
  const detailParts: string[] = [];
  if (typeof errorPayload?.code === 'string' && errorPayload.code.length > 0) {
    detailParts.push(`code=${errorPayload.code}`);
  }
  if (typeof errorPayload?.action === 'string' && errorPayload.action.length > 0) {
    detailParts.push(`action=${errorPayload.action}`);
  }

  const summary = typeof errorPayload?.message === 'string' && errorPayload.message.trim().length > 0
    ? errorPayload.message.trim()
    : (detailParts.length > 0 ? detailParts.join(' ') : 'Check the terminal response payload above for details.');

  await showTerminalErrorAlert(title, summary);
}
