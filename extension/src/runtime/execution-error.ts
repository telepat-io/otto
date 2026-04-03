export class CommandExecutionError extends Error {
  code: string;
  stage: string;
  retryable: boolean;

  constructor(message: string, code: string, stage: string, retryable = false) {
    super(message);
    this.code = code;
    this.stage = stage;
    this.retryable = retryable;
  }
}