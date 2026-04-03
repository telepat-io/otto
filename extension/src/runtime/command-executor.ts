import { nanoid } from 'nanoid';
import type { CommandPayload } from '@telepat/otto-protocol';
import { listRecipesForRuntime, runRecipeCommand } from './recipe-runtime.js';
import { CommandExecutionError } from './execution-error.js';
import { createSingleFlight } from './single-flight.js';

type ChromeLike = typeof chrome;
const AUTOMATION_GROUP_SINGLE_FLIGHT_KEY = 'automation-group.ensure';

const runtimeSingleFlight = createSingleFlight();

export type CommandExecutionResult = {
  durationMs: number;
  data: unknown;
};

async function ensureAutomationGroup(chromeApi: ChromeLike, seedTabId: number): Promise<number> {
  return runtimeSingleFlight.run(AUTOMATION_GROUP_SINGLE_FLIGHT_KEY, async () => {
    const existing = await chromeApi.storage.session.get(['automationGroupId']);
    if (existing.automationGroupId) {
      return existing.automationGroupId as number;
    }

    const groupId = await chromeApi.tabs.group({ tabIds: [seedTabId] as [number] });
    await chromeApi.tabGroups.update(groupId as number, {
      title: 'Otto',
      color: 'blue',
      collapsed: true,
    });
    await chromeApi.storage.session.set({ automationGroupId: groupId });
    return groupId as number;
  });
}

async function getTabSessions(chromeApi: ChromeLike): Promise<Record<string, number>> {
  const map = await chromeApi.storage.session.get(['tabSessions']);
  return (map.tabSessions as Record<string, number> | undefined) ?? {};
}

async function saveTabSessions(chromeApi: ChromeLike, tabSessions: Record<string, number>): Promise<void> {
  await chromeApi.storage.session.set({ tabSessions });
}

export async function resolveTabId(chromeApi: ChromeLike, tabSessionId: string | undefined): Promise<number> {
  if (!tabSessionId) {
    throw new CommandExecutionError('tabSessionId is required for this action', 'missing_tab_session', 'validation', false);
  }

  const sessions = await getTabSessions(chromeApi);
  const tabId = sessions[tabSessionId];
  if (!tabId) {
    throw new CommandExecutionError(`Unknown tabSessionId: ${tabSessionId}`, 'unknown_tab_session', 'resolve_tab', false);
  }

  try {
    await chromeApi.tabs.get(tabId);
  } catch {
    delete sessions[tabSessionId];
    await saveTabSessions(chromeApi, sessions);
    throw new CommandExecutionError(`Tab for tabSessionId is no longer available: ${tabSessionId}`, 'tab_session_closed', 'resolve_tab', true);
  }

  return tabId;
}

export async function executeCommand(chromeApi: ChromeLike, command: CommandPayload): Promise<CommandExecutionResult> {
  const start = Date.now();

  switch (command.action) {
    case 'primitive.tab.open': {
      const url = String(command.payload.url ?? 'about:blank');
      const tab = await chromeApi.tabs.create({ url, active: false });
      if (!tab.id || tab.windowId === undefined) {
        throw new CommandExecutionError('Failed to create tab', 'tab_create_failed', 'primitive.tab.open', true);
      }

      const groupId = await ensureAutomationGroup(chromeApi, tab.id);
      await chromeApi.tabs.group({ groupId, tabIds: [tab.id] as [number] });

      const tabSessionId = `tab_${nanoid(10)}`;
      const tabSessions = await getTabSessions(chromeApi);
      tabSessions[tabSessionId] = tab.id;
      await saveTabSessions(chromeApi, tabSessions);

      return {
        durationMs: Date.now() - start,
        data: { tabId: tab.id, tabSessionId, url },
      };
    }
    case 'primitive.tab.close': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const tabSessions = await getTabSessions(chromeApi);
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      await chromeApi.tabs.remove(tabId);
      delete tabSessions[tabSessionId];
      await saveTabSessions(chromeApi, tabSessions);
      return {
        durationMs: Date.now() - start,
        data: { closed: true, tabSessionId },
      };
    }
    case 'primitive.tab.navigate': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const url = String(command.payload.url ?? 'about:blank');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      await chromeApi.tabs.update(tabId, { url });
      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, url },
      };
    }
    case 'primitive.tab.query': {
      const tabSessions = await getTabSessions(chromeApi);
      return {
        durationMs: Date.now() - start,
        data: { tabSessions },
      };
    }
    case 'primitive.dom.extract_text': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const selector = String(command.payload.selector ?? 'body');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      const result = await chromeApi.scripting.executeScript({
        target: { tabId },
        func: (sel: string) => {
          const el = document.querySelector(sel);
          return el?.textContent?.trim() ?? null;
        },
        args: [selector],
      });
      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, selector, text: result[0]?.result ?? null },
      };
    }
    case 'recipe.list': {
      return {
        durationMs: Date.now() - start,
        data: { recipes: listRecipesForRuntime() },
      };
    }
    case 'recipe.run':
    case 'recipe.reddit_feed': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      const data = await runRecipeCommand(chromeApi, command, tabId, tabSessionId);
      const payload = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : { result: data };

      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, ...payload },
      };
    }
    default:
      throw new CommandExecutionError(`Unsupported action: ${command.action}`, 'unsupported_action', 'validation', false);
  }
}
