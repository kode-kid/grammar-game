import { AppError } from "../errors.js";
import type {
  AnswerEvaluation,
  ConjugationRequest,
  ConjugationResult,
  ConjugationValue,
  PronounDefinition,
  TargetScope,
  TenseDefinition,
  VerbDefinition,
  VerbGroup
} from "../models.js";
import { normalizeConjugation } from "../utils/normalize.js";

interface InternalConjugationResult extends ConjugationResult {
  acceptedNormalized: Set<string>;
}

function buildConjugationKey(
  verbInfinitive: string,
  tenseId: string,
  pronounId: string
): string {
  return `${verbInfinitive}|${tenseId}|${pronounId}`;
}

function inferVerbGroup(infinitive: string, providedGroup?: VerbGroup): VerbGroup {
  if (providedGroup) {
    return providedGroup;
  }

  if (infinitive.endsWith("ar")) {
    return "ar";
  }
  if (infinitive.endsWith("er")) {
    return "er";
  }
  if (infinitive.endsWith("ir")) {
    return "ir";
  }

  throw new AppError(
    400,
    `Could not infer verb group from infinitive "${infinitive}". Provide "group" explicitly.`
  );
}

function toVariants(value?: ConjugationValue): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
}

function asInternalResult(
  regularConjugation: string,
  irregularConjugation?: ConjugationValue
): InternalConjugationResult {
  const rawVariants = toVariants(irregularConjugation) ?? [regularConjugation];
  const cleanedVariants = rawVariants
    .map((variant) => variant.trim())
    .filter((variant) => variant.length > 0);

  if (cleanedVariants.length === 0) {
    throw new AppError(400, "Conjugation variants cannot be empty.");
  }

  const uniqueVariants = [...new Set(cleanedVariants)];

  return {
    canonical: uniqueVariants[0],
    variants: uniqueVariants,
    acceptedNormalized: new Set(uniqueVariants.map(normalizeConjugation))
  };
}

export class ConjugationEngine {
  private readonly pronouns: PronounDefinition[];
  private readonly tenses: TenseDefinition[];
  private readonly verbs: VerbDefinition[];

  private readonly pronounsById = new Map<string, PronounDefinition>();
  private readonly tensesById = new Map<string, TenseDefinition>();
  private readonly verbsByInfinitive = new Map<string, VerbDefinition>();
  private readonly conjugationByKey = new Map<string, InternalConjugationResult>();

  constructor(input: {
    pronouns: PronounDefinition[];
    tenses: TenseDefinition[];
    verbs: VerbDefinition[];
  }) {
    this.pronouns = input.pronouns.map((pronoun) => ({ ...pronoun }));
    this.tenses = input.tenses.map((tense) => ({ ...tense }));
    this.verbs = input.verbs.map((verb) => ({ ...verb }));

    this.indexPronouns();
    this.indexTenses();
    this.indexVerbs();
    this.precomputeConjugations();
  }

  public listPronouns(): PronounDefinition[] {
    return this.pronouns.map((pronoun) => ({ ...pronoun }));
  }

  public listTenses(): TenseDefinition[] {
    return this.tenses.map((tense) => ({ ...tense }));
  }

  public listVerbs(): VerbDefinition[] {
    return this.verbs.map((verb) => ({ ...verb }));
  }

  public getPronounsForScope(scope: TargetScope): PronounDefinition[] {
    const number = scope === "single" ? "singular" : "plural";
    return this.pronouns
      .filter((pronoun) => pronoun.number === number)
      .map((pronoun) => ({ ...pronoun }));
  }

  public conjugate(request: ConjugationRequest): ConjugationResult {
    const key = buildConjugationKey(
      request.verbInfinitive,
      request.tenseId,
      request.pronounId
    );
    const entry = this.conjugationByKey.get(key);

    if (!entry) {
      throw new AppError(
        400,
        `Unsupported combination: verb=${request.verbInfinitive}, tense=${request.tenseId}, pronoun=${request.pronounId}`
      );
    }

    return {
      canonical: entry.canonical,
      variants: [...entry.variants]
    };
  }

  public evaluateAnswer(
    request: ConjugationRequest & { answer: string }
  ): AnswerEvaluation {
    const key = buildConjugationKey(
      request.verbInfinitive,
      request.tenseId,
      request.pronounId
    );
    const entry = this.conjugationByKey.get(key);

    if (!entry) {
      throw new AppError(
        400,
        `Unsupported combination: verb=${request.verbInfinitive}, tense=${request.tenseId}, pronoun=${request.pronounId}`
      );
    }

    return {
      verbInfinitive: request.verbInfinitive,
      tenseId: request.tenseId,
      pronounId: request.pronounId,
      answer: request.answer,
      expected: {
        canonical: entry.canonical,
        variants: [...entry.variants]
      },
      isCorrect: entry.acceptedNormalized.has(normalizeConjugation(request.answer))
    };
  }

  private indexPronouns(): void {
    for (const pronoun of this.pronouns) {
      if (this.pronounsById.has(pronoun.id)) {
        throw new AppError(500, `Duplicate pronoun id "${pronoun.id}".`);
      }
      this.pronounsById.set(pronoun.id, pronoun);
    }
  }

  private indexTenses(): void {
    const pronounIds = this.pronouns.map((pronoun) => pronoun.id);

    for (const tense of this.tenses) {
      if (this.tensesById.has(tense.id)) {
        throw new AppError(500, `Duplicate tense id "${tense.id}".`);
      }

      this.assertRegularEndings(tense, pronounIds);
      this.tensesById.set(tense.id, tense);
    }
  }

  private indexVerbs(): void {
    for (const verb of this.verbs) {
      if (this.verbsByInfinitive.has(verb.infinitive)) {
        throw new AppError(500, `Duplicate verb infinitive "${verb.infinitive}".`);
      }
      this.verbsByInfinitive.set(verb.infinitive, verb);
    }
  }

  private precomputeConjugations(): void {
    for (const verb of this.verbs) {
      const group = inferVerbGroup(verb.infinitive, verb.group);

      for (const tense of this.tenses) {
        for (const pronoun of this.pronouns) {
          const regularConjugation = this.buildRegularConjugation(
            verb,
            tense,
            pronoun.id,
            group
          );
          const irregularConjugation = verb.irregular?.[tense.id]?.[pronoun.id];
          const result = asInternalResult(regularConjugation, irregularConjugation);

          this.conjugationByKey.set(
            buildConjugationKey(verb.infinitive, tense.id, pronoun.id),
            result
          );
        }
      }
    }
  }

  private buildRegularConjugation(
    verb: VerbDefinition,
    tense: TenseDefinition,
    pronounId: string,
    group: VerbGroup
  ): string {
    const endings = tense.regularEndings[group];
    const ending = endings[pronounId];

    if (ending === undefined) {
      throw new AppError(
        500,
        `Missing ending for tense "${tense.id}", group "${group}", pronoun "${pronounId}".`
      );
    }

    const defaultStem =
      tense.base === "infinitive" ? verb.infinitive : verb.infinitive.slice(0, -2);
    const stem = verb.stems?.[tense.id] ?? defaultStem;

    return `${stem}${ending}`;
  }

  private assertRegularEndings(
    tense: TenseDefinition,
    pronounIds: readonly string[]
  ): void {
    const groups: VerbGroup[] = ["ar", "er", "ir"];

    for (const group of groups) {
      const groupEndings = tense.regularEndings[group];

      if (!groupEndings) {
        throw new AppError(
          500,
          `Tense "${tense.id}" is missing endings for group "${group}".`
        );
      }

      for (const pronounId of pronounIds) {
        if (groupEndings[pronounId] === undefined) {
          throw new AppError(
            500,
            `Tense "${tense.id}" is missing ending for pronoun "${pronounId}" in group "${group}".`
          );
        }
      }
    }
  }
}
