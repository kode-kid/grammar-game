import { randomUUID } from "node:crypto";
import { AppError } from "../errors.js";
import type {
  CombatResolution,
  EvaluateCombatInput,
  PronounDefinition,
  ResolveChallengeInput,
  TargetScope,
  TenseDefinition,
  VerbDefinition
} from "../models.js";
import { randomItem } from "../utils/random.js";
import { LexiconService } from "./lexicon-service.js";

interface CreateChallengeInput {
  targetScope?: TargetScope;
  verbInfinitive?: string;
  tenseId?: string;
  pronounId?: string;
}

interface ChallengeView {
  challengeId: string;
  targetScope: TargetScope;
  prompt: string;
  verb: Pick<VerbDefinition, "infinitive" | "translation">;
  tense: Pick<TenseDefinition, "id" | "label" | "description" | "difficulty">;
  pronoun: Pick<PronounDefinition, "id" | "label" | "number">;
}

interface StoredChallenge {
  createdAt: number;
  targetScope: TargetScope;
  verbInfinitive: string;
  tenseId: string;
  pronounId: string;
}

const DEFAULT_BASE_DAMAGE = 10;
const SINGLE_TARGET_MULTIPLIER = 1;
const PLURAL_TARGET_MULTIPLIER = 0.82;
const MITIGATION_MULTIPLIER = 0.6;

export class BattleService {
  private readonly challenges = new Map<string, StoredChallenge>();

  constructor(
    private readonly lexiconService: LexiconService,
    private readonly challengeTtlMs = 10 * 60 * 1000
  ) {}

  public createChallenge(input: CreateChallengeInput = {}): ChallengeView {
    this.pruneExpiredChallenges();

    const engine = this.lexiconService.getEngine();
    const verbs = engine.listVerbs();
    const tenses = engine.listTenses();
    const pronouns = engine.listPronouns();
    const targetScope = input.targetScope ?? randomItem<TargetScope>(["single", "plural"]);

    const pronounsForScope = engine.getPronounsForScope(targetScope);
    if (pronounsForScope.length === 0) {
      throw new AppError(500, `No pronouns available for scope "${targetScope}".`);
    }

    const verb = this.pickVerb(verbs, input.verbInfinitive);
    const tense = this.pickTense(tenses, input.tenseId);
    const pronoun = this.pickPronoun(
      pronouns,
      pronounsForScope,
      input.pronounId,
      targetScope
    );

    const challengeId = randomUUID();
    const storedChallenge: StoredChallenge = {
      createdAt: Date.now(),
      targetScope,
      verbInfinitive: verb.infinitive,
      tenseId: tense.id,
      pronounId: pronoun.id
    };

    this.challenges.set(challengeId, storedChallenge);

    return {
      challengeId,
      targetScope,
      prompt: `Conjugate "${verb.infinitive}" for "${pronoun.label}" in "${tense.label}".`,
      verb: {
        infinitive: verb.infinitive,
        translation: verb.translation
      },
      tense: {
        id: tense.id,
        label: tense.label,
        description: tense.description,
        difficulty: tense.difficulty ?? 1
      },
      pronoun: {
        id: pronoun.id,
        label: pronoun.label,
        number: pronoun.number
      }
    };
  }

  public resolveChallenge(input: ResolveChallengeInput): CombatResolution {
    this.pruneExpiredChallenges();

    const challenge = this.challenges.get(input.challengeId);
    if (!challenge) {
      throw new AppError(404, `Challenge "${input.challengeId}" was not found or expired.`);
    }
    this.challenges.delete(input.challengeId);

    const engine = this.lexiconService.getEngine();
    const evaluation = engine.evaluateAnswer({
      verbInfinitive: challenge.verbInfinitive,
      tenseId: challenge.tenseId,
      pronounId: challenge.pronounId,
      answer: input.answer
    });

    const tenseDifficulty = this.findTenseDifficulty(challenge.tenseId);
    const damage = this.computeDamage(
      input.baseDamage,
      challenge.targetScope,
      tenseDifficulty,
      evaluation.isCorrect
    );

    return {
      challengeId: input.challengeId,
      targetScope: challenge.targetScope,
      verbInfinitive: challenge.verbInfinitive,
      tenseId: challenge.tenseId,
      pronounId: challenge.pronounId,
      answer: input.answer,
      expected: evaluation.expected.canonical,
      acceptedVariants: evaluation.expected.variants,
      isCorrect: evaluation.isCorrect,
      outcome: evaluation.isCorrect ? "deal" : "mitigate",
      damage
    };
  }

  public evaluateCombat(input: EvaluateCombatInput): CombatResolution {
    const engine = this.lexiconService.getEngine();
    const evaluation = engine.evaluateAnswer({
      verbInfinitive: input.verbInfinitive,
      tenseId: input.tenseId,
      pronounId: input.pronounId,
      answer: input.answer
    });

    const difficulty = this.findTenseDifficulty(input.tenseId);
    const damage = this.computeDamage(
      input.baseDamage,
      input.targetScope,
      difficulty,
      evaluation.isCorrect
    );

    return {
      targetScope: input.targetScope,
      verbInfinitive: input.verbInfinitive,
      tenseId: input.tenseId,
      pronounId: input.pronounId,
      answer: input.answer,
      expected: evaluation.expected.canonical,
      acceptedVariants: evaluation.expected.variants,
      isCorrect: evaluation.isCorrect,
      outcome: evaluation.isCorrect ? "deal" : "mitigate",
      damage
    };
  }

  private pruneExpiredChallenges(): void {
    const now = Date.now();
    for (const [challengeId, challenge] of this.challenges.entries()) {
      if (now - challenge.createdAt > this.challengeTtlMs) {
        this.challenges.delete(challengeId);
      }
    }
  }

  private pickVerb(
    verbs: VerbDefinition[],
    verbInfinitive?: string
  ): VerbDefinition {
    if (!verbInfinitive) {
      return randomItem(verbs);
    }

    const found = verbs.find((verb) => verb.infinitive === verbInfinitive);
    if (!found) {
      throw new AppError(400, `Unknown verb "${verbInfinitive}".`);
    }
    return found;
  }

  private pickTense(tenses: TenseDefinition[], tenseId?: string): TenseDefinition {
    if (!tenseId) {
      return randomItem(tenses);
    }

    const found = tenses.find((tense) => tense.id === tenseId);
    if (!found) {
      throw new AppError(400, `Unknown tense "${tenseId}".`);
    }
    return found;
  }

  private pickPronoun(
    allPronouns: PronounDefinition[],
    pronounsForScope: PronounDefinition[],
    pronounId: string | undefined,
    targetScope: TargetScope
  ): PronounDefinition {
    if (!pronounId) {
      return randomItem(pronounsForScope);
    }

    const found = allPronouns.find((pronoun) => pronoun.id === pronounId);
    if (!found) {
      throw new AppError(400, `Unknown pronoun "${pronounId}".`);
    }

    const expectedNumber = targetScope === "single" ? "singular" : "plural";
    if (found.number !== expectedNumber) {
      throw new AppError(
        400,
        `Pronoun "${pronounId}" does not match target scope "${targetScope}".`
      );
    }

    return found;
  }

  private findTenseDifficulty(tenseId: string): number {
    const tense = this.lexiconService
      .getEngine()
      .listTenses()
      .find((item) => item.id === tenseId);

    if (!tense) {
      throw new AppError(400, `Unknown tense "${tenseId}".`);
    }
    return tense.difficulty ?? 1;
  }

  private computeDamage(
    requestedBaseDamage: number | undefined,
    targetScope: TargetScope,
    tenseDifficulty: number,
    isCorrect: boolean
  ): { dealt: number; mitigated: number } {
    const baseDamage = this.coerceBaseDamage(requestedBaseDamage);
    const scopeMultiplier =
      targetScope === "single" ? SINGLE_TARGET_MULTIPLIER : PLURAL_TARGET_MULTIPLIER;

    if (isCorrect) {
      return {
        dealt: Math.max(1, Math.round(baseDamage * scopeMultiplier * tenseDifficulty)),
        mitigated: 0
      };
    }

    return {
      dealt: 0,
      mitigated: Math.max(1, Math.round(baseDamage * scopeMultiplier * MITIGATION_MULTIPLIER))
    };
  }

  private coerceBaseDamage(baseDamage: number | undefined): number {
    if (baseDamage === undefined) {
      return DEFAULT_BASE_DAMAGE;
    }

    if (!Number.isFinite(baseDamage)) {
      throw new AppError(400, "baseDamage must be a finite number.");
    }

    const value = Math.floor(baseDamage);
    if (value <= 0) {
      throw new AppError(400, "baseDamage must be greater than 0.");
    }
    if (value > 100_000) {
      throw new AppError(400, "baseDamage is unrealistically large.");
    }

    return value;
  }
}

export type { ChallengeView, CreateChallengeInput };
