export type VerbGroup = "ar" | "er" | "ir";
export type TargetScope = "single" | "plural";
export type Person = "first" | "second" | "third";
export type PronounNumber = "singular" | "plural";
export type ConjugationValue = string | string[];

export interface PronounDefinition {
  id: string;
  label: string;
  person: Person;
  number: PronounNumber;
}

export interface TenseDefinition {
  id: string;
  label: string;
  description: string;
  base: "stem" | "infinitive";
  difficulty?: number;
  regularEndings: Record<VerbGroup, Record<string, string>>;
}

export interface VerbDefinition {
  infinitive: string;
  translation: string;
  group?: VerbGroup;
  stems?: Record<string, string>;
  irregular?: Record<string, Record<string, ConjugationValue>>;
  tags?: string[];
}

export interface ConjugationResult {
  canonical: string;
  variants: string[];
}

export interface ConjugationRequest {
  verbInfinitive: string;
  tenseId: string;
  pronounId: string;
}

export interface AnswerEvaluation extends ConjugationRequest {
  expected: ConjugationResult;
  answer: string;
  isCorrect: boolean;
}

export interface Challenge {
  id: string;
  createdAt: number;
  targetScope: TargetScope;
  verbInfinitive: string;
  tenseId: string;
  pronounId: string;
  expected: ConjugationResult;
}

export interface ResolveChallengeInput {
  challengeId: string;
  answer: string;
  baseDamage?: number;
}

export interface EvaluateCombatInput extends ConjugationRequest {
  answer: string;
  targetScope: TargetScope;
  baseDamage?: number;
}

export interface CombatResolution {
  challengeId?: string;
  targetScope: TargetScope;
  verbInfinitive: string;
  tenseId: string;
  pronounId: string;
  answer: string;
  expected: string;
  acceptedVariants: string[];
  isCorrect: boolean;
  outcome: "deal" | "mitigate";
  damage: {
    dealt: number;
    mitigated: number;
  };
}
