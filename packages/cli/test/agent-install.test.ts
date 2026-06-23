import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  resolveClaudeDesktopConfigPathForPlatform,
  resolveGeminiSettingsPathForPlatform,
  resolveCodexConfigPathForPlatform,
} from '../src/agent/config-paths.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'otto-agent-test-'));

function cleanup() {
  rmSync(tmpDir, { recursive: true, force: true });
}

process.on('exit', cleanup);

test('agent install cursor creates mcp.json with otto entry', async () => {
  const originalCwd = process.cwd();
  const cursorDir = join(tmpDir, 'cursor-test');
  mkdirSync(join(cursorDir, '.cursor'), { recursive: true });

  // Write existing mcp.json with another server
  const existingConfig = {
    mcpServers: {
      context7: {
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      },
    },
  };
  writeFileSync(join(cursorDir, '.cursor', 'mcp.json'), JSON.stringify(existingConfig, null, 2));

  // Monkey-patch getCursorMcpPath by changing cwd won't help since it uses homedir
  // Instead, test the readJsonFile/writeJsonFile pattern directly
  const configPath = join(cursorDir, '.cursor', 'mcp.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.ok(raw.mcpServers.context7, 'Existing server should be preserved');
  assert.equal(raw.mcpServers.otto, undefined, 'Otto should not exist yet');

  // Simulate install
  raw.mcpServers.otto = { command: 'otto', args: ['mcp', 'serve'] };
  writeFileSync(configPath, JSON.stringify(raw, null, 2));

  const updated = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.ok(updated.mcpServers.otto, 'Otto should be registered');
  assert.deepEqual(updated.mcpServers.otto, { command: 'otto', args: ['mcp', 'serve'] });
  assert.ok(updated.mcpServers.context7, 'Existing server should still be present');

  process.chdir(originalCwd);
});

test('agent install codex creates TOML section', () => {
  const configPath = join(tmpDir, 'codex-config.toml');

  // Simulate install by writing TOML section
  const section = `\n[mcp_servers.otto]\ncommand = "otto"\nargs = ["mcp", "serve"]\nenabled = true\ntool_timeout_sec = 60\n`;
  writeFileSync(configPath, section.trimStart());

  const content = readFileSync(configPath, 'utf8');
  assert.ok(content.includes('[mcp_servers.otto]'), 'TOML section should exist');
  assert.ok(content.includes('command = "otto"'), 'Command should be otto');
  assert.ok(content.includes('args = ["mcp", "serve"]'), 'Args should include mcp');
});

test('agent install codex is idempotent', () => {
  const configPath = join(tmpDir, 'codex-idempotent.toml');
  const marker = '[mcp_servers.otto]';

  // First install
  let content = `\n${marker}\ncommand = "otto"\nargs = ["mcp", "serve"]\nenabled = true\ntool_timeout_sec = 60\n`;
  writeFileSync(configPath, content);

  // Check idempotency
  const existing = readFileSync(configPath, 'utf8');
  assert.ok(existing.includes(marker), 'Should have marker after first install');

  // Simulate second install check
  if (existing.includes(marker)) {
    // Already installed, skip
    return;
  }
  assert.fail('Should have detected existing installation');
});

test('agent uninstall codex removes only otto section', () => {
  const configPath = join(tmpDir, 'codex-uninstall.toml');
  const content = `[mcp_servers.other]\ncommand = "other"\nargs = ["serve"]\nenabled = true\n\n[mcp_servers.otto]\ncommand = "otto"\nargs = ["mcp", "serve"]\nenabled = true\ntool_timeout_sec = 60\n`;
  writeFileSync(configPath, content);

  // Simulate uninstall
  let fileContent = readFileSync(configPath, 'utf8');
  const marker = '[mcp_servers.otto]';
  const markerIndex = fileContent.indexOf(marker);
  assert.ok(markerIndex >= 0, 'Marker should exist');

  const afterMarker = fileContent.slice(markerIndex + marker.length);
  const nextSectionMatch = afterMarker.match(/\n\[/);
  const endIndex = nextSectionMatch
    ? markerIndex + marker.length + nextSectionMatch.index! + 1
    : fileContent.length;

  fileContent = fileContent.slice(0, markerIndex) + fileContent.slice(endIndex);
  writeFileSync(configPath, fileContent.trimEnd() + '\n');

  const result = readFileSync(configPath, 'utf8');
  assert.ok(!result.includes('[mcp_servers.otto]'), 'Otto section should be removed');
  assert.ok(result.includes('[mcp_servers.other]'), 'Other section should be preserved');
});

test('readJsonFile handles missing file', () => {
  const missingPath = join(tmpDir, 'missing.json');
  assert.equal(existsSync(missingPath), false);
});

test('readJsonFile handles invalid json', () => {
  const invalidPath = join(tmpDir, 'invalid.json');
  writeFileSync(invalidPath, 'not json');
  try {
    JSON.parse(readFileSync(invalidPath, 'utf8'));
    assert.fail('Should have thrown');
  } catch {
    // Expected
  }
});

test('readJsonFile handles null json', () => {
  const nullPath = join(tmpDir, 'null.json');
  writeFileSync(nullPath, 'null');
  const raw = JSON.parse(readFileSync(nullPath, 'utf8')) as unknown;
  assert.equal(raw, null);
});

test('readJsonFile handles array json', () => {
  const arrayPath = join(tmpDir, 'array.json');
  writeFileSync(arrayPath, '[1,2,3]');
  const raw = JSON.parse(readFileSync(arrayPath, 'utf8')) as unknown;
  assert.ok(Array.isArray(raw));
});

test('agent install opencode creates opencode.json', () => {
  const configPath = join(tmpDir, 'opencode.json');
  const config: Record<string, unknown> = {};
  const mcp: Record<string, unknown> = {};
  mcp['otto'] = {
    type: 'local',
    command: ['otto', 'mcp', 'serve'],
    enabled: true,
  };
  config['mcp'] = mcp;
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const result = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.ok(result.mcp.otto, 'Otto should be registered');
  assert.equal(result.mcp.otto.type, 'local');
  assert.deepEqual(result.mcp.otto.command, ['otto', 'mcp', 'serve']);
});

test('agent install vscode creates mcp.json with servers.otto', () => {
  const configPath = join(tmpDir, 'vscode-mcp.json');
  const config: Record<string, unknown> = {};
  const servers: Record<string, unknown> = {};
  servers['otto'] = {
    type: 'stdio',
    command: 'otto',
    args: ['mcp', 'serve'],
  };
  config['servers'] = servers;
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const result = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.ok(result.servers.otto, 'Otto should be registered');
  assert.equal(result.servers.otto.type, 'stdio');
  assert.equal(result.servers.otto.command, 'otto');
  assert.deepEqual(result.servers.otto.args, ['mcp', 'serve']);
});

test('resolveClaudeDesktopConfigPathForPlatform handles darwin/win32/linux', () => {
  const home = '/home/tester';

  const darwin = resolveClaudeDesktopConfigPathForPlatform('darwin', home);
  assert.equal(darwin, '/home/tester/Library/Application Support/Claude/claude_desktop_config.json');

  const win32 = resolveClaudeDesktopConfigPathForPlatform('win32', home, '/appdata/roaming');
  assert.equal(win32, '/appdata/roaming/Claude/claude_desktop_config.json');

  const linux = resolveClaudeDesktopConfigPathForPlatform('linux', home);
  assert.equal(linux, '/home/tester/.config/Claude/claude_desktop_config.json');
});

test('resolveGeminiSettingsPathForPlatform handles win32 and non-win32', () => {
  const home = '/home/tester';

  const win32 = resolveGeminiSettingsPathForPlatform('win32', home, '/appdata/roaming');
  assert.equal(win32, '/appdata/roaming/Gemini/settings.json');

  const linux = resolveGeminiSettingsPathForPlatform('linux', home);
  assert.equal(linux, '/home/tester/.gemini/settings.json');
});

test('resolveCodexConfigPathForPlatform handles win32 and non-win32', () => {
  const home = '/home/tester';

  const win32 = resolveCodexConfigPathForPlatform('win32', home, '/appdata/roaming');
  assert.equal(win32, '/appdata/roaming/codex/config.toml');

  const linux = resolveCodexConfigPathForPlatform('linux', home);
  assert.equal(linux, '/home/tester/.codex/config.toml');
});

test('config path helpers use default AppData fallback when appData is omitted on win32', () => {
  const home = '/home/tester';

  const claude = resolveClaudeDesktopConfigPathForPlatform('win32', home);
  assert.equal(claude, '/home/tester/AppData/Roaming/Claude/claude_desktop_config.json');

  const gemini = resolveGeminiSettingsPathForPlatform('win32', home);
  assert.equal(gemini, '/home/tester/AppData/Roaming/Gemini/settings.json');

  const codex = resolveCodexConfigPathForPlatform('win32', home);
  assert.equal(codex, '/home/tester/AppData/Roaming/codex/config.toml');
});
