/**
 * The append-only builder every extractor writes into.
 *
 * Two contracts it exists to enforce:
 *
 * 1. **Provenance is not optional.** `DesignFact` requires `at`, so a fact with
 *    no file/line/extractor/confidence cannot be constructed — the type system
 *    is the guard, not a runtime check.
 * 2. **The declared extractor is the one that shows up in the facts.** An
 *    extractor cannot quietly emit at a confidence it did not declare it could
 *    supply, or emit a kind outside its declaration. Both are thrown, loudly,
 *    at collect time — a wrong fact is worse than an absent one.
 */
import type { FactKind, Confidence } from "./fact-model.js";
import type { DesignFact } from "./fact-kinds.js";
import { atLeast } from "./fact-model.js";

/** What an extractor promised it can supply, per kind. */
export type SupplyMap = Partial<Record<FactKind, Confidence>>;

export class FactContractError extends Error {
  constructor(
    message: string,
    public readonly extractor: string,
    public readonly factKind: FactKind,
  ) {
    super(message);
    this.name = "FactContractError";
  }
}

export class FactCollector {
  readonly #facts: DesignFact[] = [];
  readonly #kinds = new Set<FactKind>();
  /** Kinds an extractor tried to read but could not resolve, with a count. */
  readonly #unresolved = new Map<string, number>();

  constructor(
    /** Registered id of the extractor filling this collector. */
    readonly extractorId: string,
    /** The extractor's declared supply map, from the registry. */
    readonly supplies: SupplyMap,
  ) {}

  /**
   * Record a fact. Throws when the fact contradicts the extractor's declaration
   * — an undeclared kind, a foreign extractor id, or a confidence stronger than
   * the one declared for that kind.
   */
  add(fact: DesignFact): void {
    const declared = this.supplies[fact.kind];
    if (declared === undefined) {
      throw new FactContractError(
        `extractor "${this.extractorId}" emitted a "${fact.kind}" fact it never declared it supplies`,
        this.extractorId,
        fact.kind,
      );
    }
    if (fact.at.extractor !== this.extractorId) {
      throw new FactContractError(
        `fact provenance names extractor "${fact.at.extractor}" but the collector belongs to "${this.extractorId}"`,
        this.extractorId,
        fact.kind,
      );
    }
    if (!atLeast(declared, fact.at.confidence)) {
      throw new FactContractError(
        `extractor "${this.extractorId}" declared "${fact.kind}" at ${declared} but emitted it at ${fact.at.confidence}`,
        this.extractorId,
        fact.kind,
      );
    }
    this.#facts.push(fact);
    this.#kinds.add(fact.kind);
  }

  /**
   * Record that something design-bearing was seen but could not be resolved —
   * a value behind a variable, a theme lookup, a `cn(...)` call. Counting these
   * is what keeps a low finding count from reading as a clean bill of health.
   */
  noteUnresolved(what: string): void {
    this.#unresolved.set(what, (this.#unresolved.get(what) ?? 0) + 1);
  }

  /** Kinds this run actually produced (not merely declared). */
  kindsPresent(): ReadonlySet<FactKind> {
    return this.#kinds;
  }

  get unresolvedCount(): number {
    let n = 0;
    for (const v of this.#unresolved.values()) n += v;
    return n;
  }

  /** Unresolved tallies, sorted for deterministic output. */
  unresolved(): Array<{ what: string; count: number }> {
    return [...this.#unresolved.entries()]
      .map(([what, count]) => ({ what, count }))
      .sort((a, b) => b.count - a.count || a.what.localeCompare(b.what));
  }

  /**
   * The collected facts, in a deterministic order (file, line, kind) so two
   * runs over the same input produce byte-identical output.
   */
  facts(): readonly DesignFact[] {
    return [...this.#facts].sort(
      (a, b) =>
        a.at.file.localeCompare(b.at.file) ||
        a.at.line - b.at.line ||
        a.kind.localeCompare(b.kind),
    );
  }
}
