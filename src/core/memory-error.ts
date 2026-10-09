/** Shared error identity for event validation and lesson replay, without import cycles. */
export class MemoryEventError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MemoryEventError";
    this.code = code;
  }
}

/** The ledger append succeeded; a later failure must never invite another append. */
export class MemoryAppendCommittedError extends MemoryEventError {
  readonly id: string;
  readonly committed = true;
  readonly ids: readonly string[];
  readonly partial: boolean;

  constructor(id: string, message: string, ids: readonly string[] = [id], expectedCount = 1) {
    super("MEMORY_COMMITTED", message);
    this.name = "MemoryAppendCommittedError";
    this.id = id;
    this.ids = [...ids];
    this.partial = this.ids.length < expectedCount;
  }
}
