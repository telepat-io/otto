/**
 * Error base class for all Otto SDK errors.
 */
export class OttoError extends Error {
  /**
   * @param message - Error message
   */
  constructor(message: string) {
    super(message);
    this.name = 'OttoError';
    Object.setPrototypeOf(this, OttoError.prototype);
  }
}

/**
 * Thrown when authentication fails (invalid credentials, revoked client, etc.)
 */
export class OttoAuthError extends OttoError {
  constructor(message: string) {
    super(message);
    this.name = 'OttoAuthError';
    Object.setPrototypeOf(this, OttoAuthError.prototype);
  }
}

/**
 * Thrown when a command or request times out.
 */
export class OttoTimeoutError extends OttoError {
  constructor(message: string) {
    super(message);
    this.name = 'OttoTimeoutError';
    Object.setPrototypeOf(this, OttoTimeoutError.prototype);
  }
}

/**
 * Thrown when a command execution fails on the node.
 */
export class OttoCommandError extends OttoError {
  /**
   * @param message - Error message
   * @param commandOutcome - Command outcome ('failed', 'timed_out', 'cancelled', etc.)
   */
  constructor(message: string, readonly commandOutcome: string) {
    super(message);
    this.name = 'OttoCommandError';
    Object.setPrototypeOf(this, OttoCommandError.prototype);
  }
}
