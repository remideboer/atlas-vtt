/** Why a 5e.tools insert failed, for mapped notices. */
export type FiveEInsertFailure = 'path' | 'art' | 'vault' | 'unknown';

export class FiveEInsertError extends Error {
  readonly reason: FiveEInsertFailure;

  constructor(reason: FiveEInsertFailure, message: string) {
    super(message);
    this.name = 'FiveEInsertError';
    this.reason = reason;
  }
}

export function insertFailureOf(error: unknown): FiveEInsertFailure {
  if (error instanceof FiveEInsertError) return error.reason;
  return 'unknown';
}
