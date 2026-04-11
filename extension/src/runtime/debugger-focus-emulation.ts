type ChromeLike = typeof chrome;

export type DebuggerFocusErrorCode =
  | 'debugger_focus_unavailable'
  | 'debugger_focus_conflict'
  | 'debugger_focus_permission_denied'
  | 'debugger_focus_attach_failed'
  | 'debugger_focus_command_failed';

export class DebuggerFocusEmulationError extends Error {
  code: DebuggerFocusErrorCode;
  retryable: boolean;

  constructor(message: string, code: DebuggerFocusErrorCode, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DebuggerFocusEmulationError';
    this.code = code;
    this.retryable = retryable;
  }
}

type TabState = {
  attached: boolean;
  ownsAttachment: boolean;
};

async function emitDebugLog(chromeApi: ChromeLike, type: string, data: Record<string, unknown>): Promise<void> {
  try {
    await chromeApi.runtime.sendMessage({
      type: 'otto.extensionLog',
      payload: {
        level: 'debug',
        type,
        data,
      },
    });
  } catch {
    // Debug logging is best-effort only.
  }
}

function classifyAttachError(error: unknown): DebuggerFocusEmulationError {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();

  if (message.includes('another debugger is already attached')) {
    return new DebuggerFocusEmulationError(
      'Cannot enable debugger focus emulation because another debugger is already attached to the tab',
      'debugger_focus_conflict',
      false,
      { cause: error as Error },
    );
  }

  if (message.includes('cannot access a chrome://') || message.includes('cannot access contents of')) {
    return new DebuggerFocusEmulationError(
      'Cannot enable debugger focus emulation on this tab due to browser security restrictions',
      'debugger_focus_permission_denied',
      false,
      { cause: error as Error },
    );
  }

  return new DebuggerFocusEmulationError(
    'Failed to attach debugger session for focus emulation',
    'debugger_focus_attach_failed',
    true,
    { cause: error as Error },
  );
}

export function createDebuggerFocusEmulationManager(chromeApi: ChromeLike) {
  const tabStates = new Map<number, TabState>();

  if (chromeApi.debugger) {
    chromeApi.debugger.onDetach.addListener((source) => {
      if (typeof source.tabId === 'number') {
        tabStates.delete(source.tabId);
      }
    });
  }

  const ensureForTab = async (tabId: number): Promise<void> => {
    await emitDebugLog(chromeApi, 'debugger_focus.ensure_requested', {
      tabId,
    });

    if (!chromeApi.debugger) {
      await emitDebugLog(chromeApi, 'debugger_focus.unavailable', {
        tabId,
      });
      throw new DebuggerFocusEmulationError(
        'Debugger API is unavailable; cannot enable focus emulation',
        'debugger_focus_unavailable',
        false,
      );
    }

    const existing = tabStates.get(tabId);
    if (existing?.attached) {
      await emitDebugLog(chromeApi, 'debugger_focus.ensure_skipped_already_attached', {
        tabId,
        ownsAttachment: existing.ownsAttachment,
      });
      return;
    }

    await emitDebugLog(chromeApi, 'debugger_focus.attach_attempt', {
      tabId,
    });

    try {
      await chromeApi.debugger.attach({ tabId }, '1.3');
      await emitDebugLog(chromeApi, 'debugger_focus.attach_succeeded', {
        tabId,
      });
    } catch (error) {
      const classified = classifyAttachError(error);
      if (classified.code !== 'debugger_focus_conflict') {
        await emitDebugLog(chromeApi, 'debugger_focus.attach_failed', {
          tabId,
          code: classified.code,
          message: classified.message,
        });
        throw classified;
      }

      await emitDebugLog(chromeApi, 'debugger_focus.attach_conflict_detected', {
        tabId,
      });

      // Another attachment may be this extension's network interception path.
      // If command succeeds, we can safely reuse the existing debugger session.
      try {
        await chromeApi.debugger.sendCommand({ tabId }, 'Emulation.setFocusEmulationEnabled', {
          enabled: true,
        });
        tabStates.set(tabId, { attached: true, ownsAttachment: false });
        await emitDebugLog(chromeApi, 'debugger_focus.reused_existing_attachment', {
          tabId,
          ownsAttachment: false,
        });
        return;
      } catch {
        await emitDebugLog(chromeApi, 'debugger_focus.reuse_failed', {
          tabId,
          code: classified.code,
          message: classified.message,
        });
        throw classified;
      }
    }
    try {
      await chromeApi.debugger.sendCommand({ tabId }, 'Emulation.setFocusEmulationEnabled', {
        enabled: true,
      });
      tabStates.set(tabId, { attached: true, ownsAttachment: true });
      await emitDebugLog(chromeApi, 'debugger_focus.enabled', {
        tabId,
        ownsAttachment: true,
      });
    } catch (error) {
      try {
        await chromeApi.debugger.detach({ tabId });
        await emitDebugLog(chromeApi, 'debugger_focus.detach_after_enable_failure', {
          tabId,
        });
      } catch {
        // Ignore detach failures while unwinding failed activation.
      }
      await emitDebugLog(chromeApi, 'debugger_focus.enable_failed', {
        tabId,
      });
      throw new DebuggerFocusEmulationError(
        'Failed to enable debugger focus emulation on the tab',
        'debugger_focus_command_failed',
        true,
        { cause: error as Error },
      );
    }
  };

  const stopForTab = async (tabId: number): Promise<void> => {
    await emitDebugLog(chromeApi, 'debugger_focus.stop_requested', {
      tabId,
    });

    if (!chromeApi.debugger) {
      tabStates.delete(tabId);
      await emitDebugLog(chromeApi, 'debugger_focus.stop_without_debugger_api', {
        tabId,
      });
      return;
    }

    const existing = tabStates.get(tabId);
    if (!existing?.attached) {
      await emitDebugLog(chromeApi, 'debugger_focus.stop_skipped_not_attached', {
        tabId,
      });
      return;
    }

    try {
      await chromeApi.debugger.sendCommand({ tabId }, 'Emulation.setFocusEmulationEnabled', {
        enabled: false,
      });
    } catch {
      // Ignore disable failures and continue detach attempt.
    }

    if (existing.ownsAttachment) {
      try {
        await chromeApi.debugger.detach({ tabId });
        await emitDebugLog(chromeApi, 'debugger_focus.detached_owned_attachment', {
          tabId,
        });
      } catch {
        // Ignore detach failures for closed tabs.
      }
    } else {
      await emitDebugLog(chromeApi, 'debugger_focus.detach_skipped_shared_attachment', {
        tabId,
      });
    }

    tabStates.delete(tabId);
    await emitDebugLog(chromeApi, 'debugger_focus.stopped', {
      tabId,
    });
  };

  return {
    ensureForTab,
    stopForTab,
  };
}