import type { PronounDefinition } from "../models.js";

export const PRONOUNS: PronounDefinition[] = [
  { id: "eu", label: "eu", person: "first", number: "singular" },
  { id: "tu", label: "tu", person: "second", number: "singular" },
  { id: "voce", label: "você", person: "third", number: "singular" },
  { id: "nos", label: "nós", person: "first", number: "plural" },
  { id: "voces", label: "vocês", person: "third", number: "plural" },
  { id: "eles", label: "eles/elas", person: "third", number: "plural" }
];
