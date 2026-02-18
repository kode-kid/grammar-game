import assert from "node:assert/strict";
import test from "node:test";
import { PRONOUNS } from "../src/data/pronouns.js";
import { ConjugationEngine } from "../src/engine/conjugation-engine.js";
import type { TenseDefinition, VerbDefinition } from "../src/models.js";

const presentIndicative: TenseDefinition = {
  id: "present_indicative",
  label: "Presente",
  description: "Present tense",
  base: "stem",
  regularEndings: {
    ar: {
      eu: "o",
      tu: "as",
      voce: "a",
      nos: "amos",
      voces: "am",
      eles: "am"
    },
    er: {
      eu: "o",
      tu: "es",
      voce: "e",
      nos: "emos",
      voces: "em",
      eles: "em"
    },
    ir: {
      eu: "o",
      tu: "es",
      voce: "e",
      nos: "imos",
      voces: "em",
      eles: "em"
    }
  }
};

const verbs: VerbDefinition[] = [
  {
    infinitive: "falar",
    translation: "to speak"
  },
  {
    infinitive: "ser",
    translation: "to be",
    irregular: {
      present_indicative: {
        eu: "sou",
        voces: "são"
      }
    }
  },
  {
    infinitive: "aceitar",
    translation: "to accept",
    irregular: {
      present_indicative: {
        voce: ["aceita", "aceite"]
      }
    }
  }
];

test("engine returns regular conjugations", () => {
  const engine = new ConjugationEngine({
    pronouns: PRONOUNS,
    tenses: [presentIndicative],
    verbs
  });

  const conjugation = engine.conjugate({
    verbInfinitive: "falar",
    tenseId: "present_indicative",
    pronounId: "eu"
  });

  assert.equal(conjugation.canonical, "falo");
});

test("engine evaluates irregular forms accent-insensitively", () => {
  const engine = new ConjugationEngine({
    pronouns: PRONOUNS,
    tenses: [presentIndicative],
    verbs
  });

  const evaluation = engine.evaluateAnswer({
    verbInfinitive: "ser",
    tenseId: "present_indicative",
    pronounId: "voces",
    answer: "sao"
  });

  assert.equal(evaluation.expected.canonical, "são");
  assert.equal(evaluation.isCorrect, true);
});

test("engine accepts alternate irregular variants", () => {
  const engine = new ConjugationEngine({
    pronouns: PRONOUNS,
    tenses: [presentIndicative],
    verbs
  });

  const evaluation = engine.evaluateAnswer({
    verbInfinitive: "aceitar",
    tenseId: "present_indicative",
    pronounId: "voce",
    answer: "aceite"
  });

  assert.equal(evaluation.expected.canonical, "aceita");
  assert.deepEqual(evaluation.expected.variants, ["aceita", "aceite"]);
  assert.equal(evaluation.isCorrect, true);
});
