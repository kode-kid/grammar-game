import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConjugationEngine } from "../engine/conjugation-engine.js";
import { AppError } from "../errors.js";
import { PRONOUNS } from "../data/pronouns.js";
import type { TenseDefinition, VerbDefinition } from "../models.js";

async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new AppError(500, `Failed to read or parse ${filePath}: ${String(error)}`);
  }
}

async function writeJsonFile<T>(filePath: string, value: T): Promise<void> {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filePath, payload, "utf8");
}

export class LexiconService {
  private readonly verbsPath: string;
  private readonly tensesPath: string;

  private verbs: VerbDefinition[] = [];
  private tenses: TenseDefinition[] = [];
  private engine: ConjugationEngine | null = null;

  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDirectory = path.resolve(process.cwd(), "data")) {
    this.verbsPath = path.join(dataDirectory, "verbs.json");
    this.tensesPath = path.join(dataDirectory, "tenses.json");
  }

  public async initialize(): Promise<void> {
    this.verbs = await readJsonFile<VerbDefinition[]>(this.verbsPath);
    this.tenses = await readJsonFile<TenseDefinition[]>(this.tensesPath);
    this.rebuildEngine();
  }

  public getEngine(): ConjugationEngine {
    if (!this.engine) {
      throw new AppError(500, "Lexicon service not initialized.");
    }
    return this.engine;
  }

  public getReferenceData(): {
    pronouns: ReturnType<ConjugationEngine["listPronouns"]>;
    tenses: ReturnType<ConjugationEngine["listTenses"]>;
    verbs: ReturnType<ConjugationEngine["listVerbs"]>;
  } {
    const engine = this.getEngine();
    return {
      pronouns: engine.listPronouns(),
      tenses: engine.listTenses(),
      verbs: engine.listVerbs()
    };
  }

  public async addVerb(input: VerbDefinition): Promise<VerbDefinition> {
    const verb: VerbDefinition = {
      ...input,
      infinitive: input.infinitive.trim().toLowerCase()
    };

    if (this.verbs.some((item) => item.infinitive === verb.infinitive)) {
      throw new AppError(409, `Verb "${verb.infinitive}" already exists.`);
    }

    this.verbs.push(verb);
    this.rebuildEngine();
    await this.enqueueWrite(() => writeJsonFile(this.verbsPath, this.verbs));

    return verb;
  }

  public async addTense(input: TenseDefinition): Promise<TenseDefinition> {
    const tense: TenseDefinition = {
      ...input,
      id: input.id.trim().toLowerCase(),
      difficulty: input.difficulty ?? 1
    };

    if (this.tenses.some((item) => item.id === tense.id)) {
      throw new AppError(409, `Tense "${tense.id}" already exists.`);
    }

    this.tenses.push(tense);
    this.rebuildEngine();
    await this.enqueueWrite(() => writeJsonFile(this.tensesPath, this.tenses));

    return tense;
  }

  private rebuildEngine(): void {
    this.engine = new ConjugationEngine({
      pronouns: PRONOUNS,
      tenses: this.tenses,
      verbs: this.verbs
    });
  }

  private async enqueueWrite(task: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(task);
    this.writeQueue = next.catch(() => undefined);
    await next;
  }
}
