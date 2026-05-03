import { join } from 'node:path';

export function resolveClaudeDesktopConfigPathForPlatform(
  platform: string,
  homeDir: string,
  appData?: string,
): string {
  if (platform === 'darwin') {
    return join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (platform === 'win32') {
    return join(appData ?? join(homeDir, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  return join(homeDir, '.config', 'Claude', 'claude_desktop_config.json');
}

export function resolveGeminiSettingsPathForPlatform(platform: string, homeDir: string, appData?: string): string {
  if (platform === 'win32') {
    return join(appData ?? join(homeDir, 'AppData', 'Roaming'), 'Gemini', 'settings.json');
  }
  return join(homeDir, '.gemini', 'settings.json');
}

export function resolveCodexConfigPathForPlatform(platform: string, homeDir: string, appData?: string): string {
  if (platform === 'win32') {
    return join(appData ?? join(homeDir, 'AppData', 'Roaming'), 'codex', 'config.toml');
  }
  return join(homeDir, '.codex', 'config.toml');
}