import React, { useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import { Alert, StatusMessage } from '@inkjs/ui';
import { DEFAULT_CONTROLLER_RELAY_URL, deriveHttpUrl, type OttoConfig } from './config.js';
import { resolveSettingsResult } from './settings-logic.js';

type SettingItem = {
  id: string;
  label: string;
  get: (config: OttoConfig) => string;
  choices: (config: OttoConfig) => Array<{
    label: string;
    description?: string;
    apply: (config: OttoConfig) => OttoConfig;
  }>;
};

function normalizeControllerRelayUrl(urlValue: string): string {
  const parsed = new URL(urlValue.trim());
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('relayUrl must use ws:// or wss://');
  }
  if (parsed.searchParams.get('role') !== 'controller') {
    parsed.searchParams.set('role', 'controller');
  }
  return parsed.toString();
}

const SETTINGS: SettingItem[] = [
  {
    id: 'relayUrl',
    label: 'Relay URL (controller)',
    get: (config) => config.relayUrl,
    choices: (config) => [
      {
        label: 'Local relay (127.0.0.1:8787)',
        description: 'ws://127.0.0.1:8787?role=controller',
        apply: (next) => {
          const relayUrl = normalizeControllerRelayUrl('ws://127.0.0.1:8787?role=controller');
          return {
            ...next,
            relayUrl,
            relayHttpUrl: deriveHttpUrl(relayUrl),
          };
        },
      },
      {
        label: 'Local relay (localhost:8787)',
        description: 'ws://localhost:8787?role=controller',
        apply: (next) => {
          const relayUrl = normalizeControllerRelayUrl('ws://localhost:8787?role=controller');
          return {
            ...next,
            relayUrl,
            relayHttpUrl: deriveHttpUrl(relayUrl),
          };
        },
      },
      {
        label: 'Keep current relay URL',
        description: config.relayUrl,
        apply: (next) => next,
      },
    ],
  },
  {
    id: 'relayHttpUrl',
    label: 'Relay HTTP URL override',
    get: (config) => config.relayHttpUrl ?? '',
    choices: () => [
      {
        label: 'Auto derive from relay URL',
        description: 'Clear explicit override',
        apply: (next) => ({
          ...next,
          relayHttpUrl: undefined,
        }),
      },
      {
        label: 'HTTP local override',
        description: 'http://127.0.0.1:8787',
        apply: (next) => ({
          ...next,
          relayHttpUrl: 'http://127.0.0.1:8787',
        }),
      },
    ],
  },
  {
    id: 'targetNodeId',
    label: 'Default target node ID',
    get: (config) => config.targetNodeId ?? '',
    choices: (config) => [
      {
        label: 'Keep current default node',
        description: config.targetNodeId ?? '<none>',
        apply: (next) => next,
      },
      {
        label: 'Clear default node',
        description: 'Require --node-id on command calls',
        apply: (next) => ({
          ...next,
          targetNodeId: undefined,
        }),
      },
    ],
  },
  {
    id: 'outputFormat',
    label: 'Default output format',
    get: (config) => config.outputFormat ?? 'pretty',
    choices: () => [
      {
        label: 'pretty',
        description: 'Human-readable command output',
        apply: (next) => ({ ...next, outputFormat: 'pretty' }),
      },
      {
        label: 'json',
        description: 'Structured output for scripts',
        apply: (next) => ({ ...next, outputFormat: 'json' }),
      },
    ],
  },
  {
    id: 'setupStrategyDefault',
    label: 'Default setup strategy',
    get: (config) => config.setupStrategyDefault ?? 'auto',
    choices: () => [
      {
        label: 'auto',
        description: 'Recommended default for setup',
        apply: (next) => ({ ...next, setupStrategyDefault: 'auto' }),
      },
      {
        label: 'download',
        description: 'Always download release artifact',
        apply: (next) => ({ ...next, setupStrategyDefault: 'download' }),
      },
      {
        label: 'build',
        description: 'Prefer local extension build',
        apply: (next) => ({ ...next, setupStrategyDefault: 'build' }),
      },
    ],
  },
  {
    id: 'setupNonInteractiveDefault',
    label: 'Setup non-interactive default',
    get: (config) => String(Boolean(config.setupNonInteractiveDefault)),
    choices: () => [
      {
        label: 'true',
        description: 'Use deterministic non-interactive setup output by default',
        apply: (next) => ({ ...next, setupNonInteractiveDefault: true }),
      },
      {
        label: 'false',
        description: 'Use interactive setup by default',
        apply: (next) => ({ ...next, setupNonInteractiveDefault: false }),
      },
    ],
  },
  {
    id: 'downloadTimeoutMs',
    label: 'Extension download timeout ms',
    get: (config) => String(config.downloadTimeoutMs ?? 25000),
    choices: () => [
      {
        label: '10000',
        description: '10 seconds',
        apply: (next) => ({ ...next, downloadTimeoutMs: 10000 }),
      },
      {
        label: '25000',
        description: '25 seconds (default)',
        apply: (next) => ({ ...next, downloadTimeoutMs: 25000 }),
      },
      {
        label: '60000',
        description: '60 seconds',
        apply: (next) => ({ ...next, downloadTimeoutMs: 60000 }),
      },
    ],
  },
  {
    id: 'strictVersionCheck',
    label: 'Strict extension version check',
    get: (config) => String(Boolean(config.strictVersionCheck)),
    choices: () => [
      {
        label: 'true',
        description: 'Require exact CLI/extension version match',
        apply: (next) => ({ ...next, strictVersionCheck: true }),
      },
      {
        label: 'false',
        description: 'Allow non-strict version behavior',
        apply: (next) => ({ ...next, strictVersionCheck: false }),
      },
    ],
  },
];

function SettingsScreen({
  initial,
  onDone,
}: {
  initial: OttoConfig;
  onDone: (config: OttoConfig) => void;
}): React.JSX.Element {
  const { exit } = useApp();
  const [config, setConfig] = useState<OttoConfig>({
    ...initial,
    relayUrl: initial.relayUrl || DEFAULT_CONTROLLER_RELAY_URL,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [choosingIndex, setChoosingIndex] = useState<number | null>(null);
  const [choiceCursor, setChoiceCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useInput((input, key) => {
    if (choosingIndex !== null) {
      if (key.escape) {
        setChoosingIndex(null);
        setChoiceCursor(0);
        setError(null);
        return;
      }

      const item = SETTINGS[choosingIndex];
      if (!item) {
        setChoosingIndex(null);
        setChoiceCursor(0);
        return;
      }

      const choices = item.choices(config);
      if (choices.length === 0) {
        setChoosingIndex(null);
        setChoiceCursor(0);
        return;
      }

      if (key.upArrow) {
        setChoiceCursor((prev) => (prev - 1 + choices.length) % choices.length);
        return;
      }

      if (key.downArrow) {
        setChoiceCursor((prev) => (prev + 1) % choices.length);
        return;
      }

      if (key.return) {
        try {
          const choice = choices[choiceCursor];
          if (!choice) {
            return;
          }
          const next = choice.apply(config);
          setConfig(next);
          setChoosingIndex(null);
          setChoiceCursor(0);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      return;
    }

    if (key.escape || input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    if (saved) {
      exit();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev - 1 + SETTINGS.length) % SETTINGS.length);
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev + 1) % SETTINGS.length);
      return;
    }

    if (input === 's') {
      onDone(config);
      setSaved(true);
      return;
    }

    if (key.return) {
      const item = SETTINGS[selectedIndex];
      if (!item) {
        return;
      }

      const choices = item.choices(config);
      if (choices.length === 0) {
        return;
      }

      setChoosingIndex(selectedIndex);
      setChoiceCursor(0);
      setError(null);
    }
  });

  const activeChoices = choosingIndex !== null ? SETTINGS[choosingIndex]?.choices(config) ?? [] : [];
  const activeSetting = choosingIndex !== null ? SETTINGS[choosingIndex] : null;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>Otto Controller Settings</Text>
      <StatusMessage variant="info">Use up/down to navigate. Enter to select options. Press s to save.</StatusMessage>
      <Box marginTop={1} flexDirection="column">
        {SETTINGS.map((item, index) => {
          const focused = index === selectedIndex;
          const choosing = index === choosingIndex;
          return (
            <Text key={item.id} color={focused ? 'yellow' : undefined}>
              {focused ? '>' : ' '} {item.label}: {item.get(config)}{choosing ? ' (selecting)' : ''}
            </Text>
          );
        })}
      </Box>
      {choosingIndex !== null ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">Options for {activeSetting?.label ?? 'setting'}</Text>
          {activeChoices.map((choice, index) => {
            const focused = index === choiceCursor;
            return (
              <Text key={`${choice.label}-${index}`} color={focused ? 'yellow' : undefined}>
                {focused ? '>' : ' '} {choice.label}{choice.description ? ` - ${choice.description}` : ''}
              </Text>
            );
          })}
        </Box>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {saved ? <StatusMessage variant="success">Settings saved. Press any key to exit.</StatusMessage> : null}
      {choosingIndex !== null ? <Text dimColor>Use up/down to choose an option. Enter to apply. Esc to cancel.</Text> : <Text dimColor>Press q or Esc to exit without saving.</Text>}
    </Box>
  );
}

export async function runSettingsTui(initial: OttoConfig): Promise<OttoConfig> {
  return new Promise<OttoConfig>((resolvePromise) => {
    let finalConfig = initial;
    let didSave = false;
    const app = render(
      <SettingsScreen
        initial={initial}
        onDone={(nextConfig) => {
          finalConfig = nextConfig;
          didSave = true;
        }}
      />,
    );

    void app.waitUntilExit().then(() => {
      resolvePromise(resolveSettingsResult(initial, finalConfig, didSave));
    });
  });
}
