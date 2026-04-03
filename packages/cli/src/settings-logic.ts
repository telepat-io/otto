import { type OttoConfig } from './config.js';

export function settingsEscapeAction(editingIndex: number | null): 'cancel-edit' | 'exit' {
  return editingIndex !== null ? 'cancel-edit' : 'exit';
}

export function resolveSettingsResult(initial: OttoConfig, candidate: OttoConfig, didSave: boolean): OttoConfig {
  return didSave ? candidate : initial;
}
