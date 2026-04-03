import React, { useEffect, useMemo, useState } from 'react';
import { Box, Static, Text, render, useApp, useInput } from 'ink';
import { Alert, ConfirmInput, Select, Spinner, StatusMessage, TextInput, UnorderedList } from '@inkjs/ui';
import { nanoid } from 'nanoid';
import WebSocket from 'ws';
import { createEnvelope, type CommandPayload, type Envelope } from '@telepat/otto-protocol';
import { DEFAULT_CONTROLLER_RELAY_URL, deriveHttpUrl, type OttoConfig } from './config.js';
import { resolveSettingsResult } from './settings-logic.js';
import { openControllerSocket } from './index.js';

type CommandTuiOptions = {
  targetNodeId: string;
  tabSessionId?: string;
  action: string;
  payload: string;
};

type LogLine = {
  id: string;
  line: string;
};

type LogSource = 'relay' | 'controller' | 'node' | 'all';

function jsonLine(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function safeJsonParsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { raw: value };
  }
}

function CommandScreen({ config, options }: { config: OttoConfig; options: CommandTuiOptions }): React.JSX.Element {
  const { exit } = useApp();
  const [status, setStatus] = useState<'connecting' | 'awaiting_result' | 'done' | 'failed'>('connecting');
  const [result, setResult] = useState<Envelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commandPayload = useMemo<CommandPayload>(() => ({
    targetNodeId: options.targetNodeId,
    tabSessionId: options.tabSessionId,
    action: options.action,
    payload: safeJsonParsePayload(options.payload),
    idempotencyKey: nanoid(),
    replayNonce: nanoid(),
    timeoutMs: 30_000,
    waitPolicy: 'fail_fast',
  }), [options.action, options.payload, options.tabSessionId, options.targetNodeId]);

  useInput((input, key) => {
    if (input === 'q' || key.escape || key.ctrl && input === 'c') {
      exit();
    }
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    const run = async (): Promise<void> => {
      try {
        ws = await openControllerSocket(config);
        if (closed) {
          ws.close();
          return;
        }

        const requestId = nanoid();
        setStatus('awaiting_result');

        ws.send(JSON.stringify(createEnvelope('command', 'controller', requestId, commandPayload)));

        ws.on('message', (data) => {
          if (closed) {
            return;
          }
          const msg = JSON.parse(String(data)) as Envelope;
          if (msg.requestId === requestId || msg.messageType === 'error') {
            setResult(msg);
            setStatus(msg.messageType === 'error' ? 'failed' : 'done');
          }
        });

        ws.on('error', (wsError) => {
          if (closed) {
            return;
          }
          setError(String(wsError));
          setStatus('failed');
        });
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : String(runError));
        setStatus('failed');
      }
    };

    void run();

    return () => {
      closed = true;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [commandPayload, config]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>Otto Command</Text>
      <UnorderedList>
        <UnorderedList.Item>
          <Text>Action: {options.action}</Text>
        </UnorderedList.Item>
        <UnorderedList.Item>
          <Text>Target Node: {options.targetNodeId}</Text>
        </UnorderedList.Item>
        {options.tabSessionId ? (
          <UnorderedList.Item>
            <Text>Tab Session: {options.tabSessionId}</Text>
          </UnorderedList.Item>
        ) : null}
      </UnorderedList>
      {status === 'connecting' || status === 'awaiting_result' ? (
        <Box marginTop={1}>
          <Spinner label={status === 'connecting' ? 'Connecting to relay' : 'Waiting for terminal response'} />
        </Box>
      ) : null}
      {status === 'done' ? <StatusMessage variant="success">Command completed</StatusMessage> : null}
      {status === 'failed' ? <StatusMessage variant="error">Command failed</StatusMessage> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {result ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={status === 'failed' ? 'red' : 'green'}>{status === 'failed' ? 'Failure response' : 'Response payload'}</Text>
          {jsonLine(result).split('\n').map((line, index) => (
            <Text key={`response-${index}`}>{line}</Text>
          ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>Press q to exit.</Text>
      </Box>
    </Box>
  );
}

function LogsFollowScreen({ config, source }: { config: OttoConfig; source?: LogSource }): React.JSX.Element {
  const { exit } = useApp();
  const [status, setStatus] = useState<'connecting' | 'subscribed' | 'failed'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogLine[]>([]);

  useInput((input, key) => {
    if (input === 'q' || key.escape || key.ctrl && input === 'c') {
      exit();
    }
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    const run = async (): Promise<void> => {
      try {
        ws = await openControllerSocket(config);
        if (closed) {
          ws.close();
          return;
        }

        const requestId = nanoid();
        ws.send(
          JSON.stringify(
            createEnvelope('event', 'controller', requestId, {
              type: 'logs_subscribe',
              source,
            }),
          ),
        );
        setStatus('subscribed');

        ws.on('message', (data) => {
          if (closed) {
            return;
          }

          const msg = JSON.parse(String(data)) as Envelope;
          if (msg.messageType === 'event') {
            const payload = msg.payload as { type?: string; entry?: unknown };
            if (payload.type === 'log') {
              const line = jsonLine(payload.entry);
              setEntries((prev) => [...prev, { id: nanoid(), line }]);
            }
          }

          if (msg.messageType === 'error') {
            setStatus('failed');
            setError(jsonLine(msg.payload));
          }
        });

        ws.on('error', (wsError) => {
          if (closed) {
            return;
          }
          setStatus('failed');
          setError(String(wsError));
        });
      } catch (runError) {
        setStatus('failed');
        setError(runError instanceof Error ? runError.message : String(runError));
      }
    };

    void run();

    return () => {
      closed = true;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [config]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>Otto Logs Follow</Text>
      <Text dimColor>Source filter: {source ?? 'all'}</Text>
      {status === 'connecting' ? <Spinner label="Connecting and subscribing to logs" /> : null}
      {status === 'subscribed' ? <StatusMessage variant="success">Subscribed to live relay logs</StatusMessage> : null}
      {status === 'failed' ? <StatusMessage variant="error">Log stream failed</StatusMessage> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Box marginTop={1}>
        <Text dimColor>Press q to stop following.</Text>
      </Box>
      <Static items={entries}>
        {(entry) => (
          <Text key={entry.id}>{entry.line}</Text>
        )}
      </Static>
    </Box>
  );
}

export async function runCommandTui(config: OttoConfig, options: CommandTuiOptions): Promise<void> {
  const app = render(<CommandScreen config={config} options={options} />);
  await app.waitUntilExit();
}

export async function runLogsFollowTui(config: OttoConfig, source?: LogSource): Promise<void> {
  const app = render(<LogsFollowScreen config={config} source={source} />);
  await app.waitUntilExit();
}

type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

type SelectTuiOptions = {
  title: string;
  hint?: string;
  options: SelectOption[];
  initialValue?: string;
};

export type SetupPromptDefaults = {
  relayUrl: string;
  strategy: 'auto' | 'download' | 'build';
  repoPath?: string;
};

export type SetupPromptResult = {
  relayUrl: string;
  strategy: 'auto' | 'download' | 'build';
  repoPath?: string;
};

function SelectScreen({
  title,
  hint,
  options,
  initialValue,
  onDone,
}: {
  title: string;
  hint?: string;
  options: SelectOption[];
  initialValue?: string;
  onDone: (value: string | null) => void;
}): React.JSX.Element {
  const { exit } = useApp();
  const initialIndex = Math.max(0, options.findIndex((option) => option.value === initialValue));
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useInput((input, key) => {
    if (key.escape || input === 'q' || (key.ctrl && input === 'c')) {
      onDone(null);
      exit();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev + 1) % options.length);
      return;
    }

    if (key.return) {
      const next = options[selectedIndex];
      onDone(next?.value ?? null);
      exit();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      <Text dimColor>{hint ?? 'Use up/down to navigate. Enter to confirm. Esc or q to cancel.'}</Text>
      <Box marginTop={1} flexDirection="column">
        {options.map((option, index) => {
          const focused = selectedIndex === index;
          return (
            <Text key={option.value} color={focused ? 'yellow' : undefined}>
              {focused ? '>' : ' '} {option.label}{option.description ? ` - ${option.description}` : ''}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}

export async function runSelectTui(options: SelectTuiOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let selectedValue: string | null = null;
    const app = render(
      <SelectScreen
        title={options.title}
        hint={options.hint}
        options={options.options}
        initialValue={options.initialValue}
        onDone={(value) => {
          selectedValue = value;
        }}
      />,
    );

    void app.waitUntilExit().then(() => {
      resolve(selectedValue);
    });
  });
}

function SetupPromptScreen({
  defaults,
  onDone,
}: {
  defaults: SetupPromptDefaults;
  onDone: (result: SetupPromptResult | null) => void;
}): React.JSX.Element {
  const { exit } = useApp();
  const [step, setStep] = useState<'strategy' | 'repo' | 'confirm'>('strategy');
  const [strategy, setStrategy] = useState<'auto' | 'download' | 'build'>(defaults.strategy);
  const [repoPath, setRepoPath] = useState(defaults.repoPath ?? '');
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape || input === 'q' || (key.ctrl && input === 'c')) {
      onDone(null);
      exit();
    }
  });

  const resolvedRepoPath = repoPath.trim() || defaults.repoPath?.trim() || '';

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>Otto Setup</Text>
      <StatusMessage variant="info">Guided controller setup</StatusMessage>
      <Text>Relay URL: {defaults.relayUrl}</Text>

      {step === 'strategy' ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Select extension artifact strategy</Text>
          <Select
            options={[
              {
                label: 'auto - local build in repo, otherwise download release artifact',
                value: 'auto',
              },
              {
                label: 'download - always fetch release artifact',
                value: 'download',
              },
              {
                label: 'build - always use local repo build output',
                value: 'build',
              },
            ]}
            onChange={(value) => {
              const next = value as 'auto' | 'download' | 'build';
              setStrategy(next);
              setError(null);
              setStep(next === 'build' ? 'repo' : 'confirm');
            }}
          />
        </Box>
      ) : null}

      {step === 'repo' ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Local repo path for build strategy</Text>
          <Text dimColor>Press Enter to continue. Esc/q to cancel setup.</Text>
          <TextInput
            placeholder="/path/to/otto/repo"
            defaultValue={repoPath}
            onChange={(value) => {
              setRepoPath(value);
              setError(null);
            }}
            onSubmit={(value) => {
              const nextValue = value.trim() || defaults.repoPath?.trim() || '';
              if (!nextValue) {
                setError('Build strategy requires a repo path');
                return;
              }
              setRepoPath(nextValue);
              setStep('confirm');
            }}
          />
        </Box>
      ) : null}

      {step === 'confirm' ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Confirm setup inputs</Text>
          <UnorderedList>
            <UnorderedList.Item>
              <Text>relayUrl: {defaults.relayUrl}</Text>
            </UnorderedList.Item>
            <UnorderedList.Item>
              <Text>strategy: {strategy}</Text>
            </UnorderedList.Item>
            {strategy === 'build' ? (
              <UnorderedList.Item>
                <Text>repoPath: {resolvedRepoPath}</Text>
              </UnorderedList.Item>
            ) : null}
          </UnorderedList>
          <Text dimColor>Confirm to continue setup, or cancel to go back.</Text>
          <ConfirmInput
            onConfirm={() => {
              if (strategy === 'build' && !resolvedRepoPath) {
                setError('Build strategy requires a repo path');
                setStep('repo');
                return;
              }

              onDone({
                relayUrl: defaults.relayUrl,
                strategy,
                repoPath: strategy === 'build' ? resolvedRepoPath : undefined,
              });
              exit();
            }}
            onCancel={() => {
              setStep(strategy === 'build' ? 'repo' : 'strategy');
            }}
          />
        </Box>
      ) : null}

      {step !== 'confirm' ? (
        <Box marginTop={1}>
          <Spinner label="Waiting for input" />
        </Box>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}
      <Text dimColor>Press q, Esc, or Ctrl+C to cancel.</Text>
    </Box>
  );
}

export async function runSetupPromptTui(defaults: SetupPromptDefaults): Promise<SetupPromptResult | null> {
  return new Promise<SetupPromptResult | null>((resolve) => {
    let selected: SetupPromptResult | null = null;
    const app = render(
      <SetupPromptScreen
        defaults={defaults}
        onDone={(result) => {
          selected = result;
        }}
      />,
    );

    void app.waitUntilExit().then(() => {
      resolve(selected);
    });
  });
}

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
