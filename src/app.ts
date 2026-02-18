import cors from "@fastify/cors";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { AppError } from "./errors.js";
import { BattleService } from "./services/battle-service.js";
import { LexiconService } from "./services/lexicon-service.js";

const scopeEnum = ["single", "plural"] as const;

const challengeQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    targetScope: { type: "string", enum: scopeEnum },
    verbInfinitive: { type: "string" },
    tenseId: { type: "string" },
    pronounId: { type: "string" }
  }
} as const;

const resolveBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["challengeId", "answer"],
  properties: {
    challengeId: { type: "string", minLength: 1 },
    answer: { type: "string", minLength: 1 },
    baseDamage: { type: "number", minimum: 1 }
  }
} as const;

const evaluateBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["verbInfinitive", "tenseId", "pronounId", "targetScope", "answer"],
  properties: {
    verbInfinitive: { type: "string", minLength: 1 },
    tenseId: { type: "string", minLength: 1 },
    pronounId: { type: "string", minLength: 1 },
    targetScope: { type: "string", enum: scopeEnum },
    answer: { type: "string", minLength: 1 },
    baseDamage: { type: "number", minimum: 1 }
  }
} as const;

const addVerbBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["infinitive", "translation"],
  properties: {
    infinitive: { type: "string", minLength: 2 },
    translation: { type: "string", minLength: 1 },
    group: { type: "string", enum: ["ar", "er", "ir"] },
    stems: {
      type: "object",
      additionalProperties: { type: "string" }
    },
    irregular: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: {
          anyOf: [
            { type: "string" },
            {
              type: "array",
              items: { type: "string" },
              minItems: 1
            }
          ]
        }
      }
    },
    tags: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;

const addTenseBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "description", "base", "regularEndings"],
  properties: {
    id: { type: "string", minLength: 1 },
    label: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    base: { type: "string", enum: ["stem", "infinitive"] },
    difficulty: { type: "number", minimum: 0.1, maximum: 5 },
    regularEndings: {
      type: "object",
      required: ["ar", "er", "ir"],
      additionalProperties: false,
      properties: {
        ar: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        er: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        ir: {
          type: "object",
          additionalProperties: { type: "string" }
        }
      }
    }
  }
} as const;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const lexiconService = new LexiconService();
  await lexiconService.initialize();
  const battleService = new BattleService(lexiconService);
  const indexPath = path.resolve(process.cwd(), "public", "index.html");
  const indexHtml = await readFile(indexPath, "utf8");

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8").send(indexHtml);
  });

  app.get("/api/health", async () => {
    return {
      status: "ok"
    };
  });

  app.get("/api/reference", async () => {
    return lexiconService.getReferenceData();
  });

  app.get<{
    Querystring: {
      targetScope?: "single" | "plural";
      verbInfinitive?: string;
      tenseId?: string;
      pronounId?: string;
    };
  }>(
    "/api/challenges/next",
    {
      schema: { querystring: challengeQuerySchema }
    },
    async (request) => {
      return battleService.createChallenge(request.query);
    }
  );

  app.post<{
    Body: {
      challengeId: string;
      answer: string;
      baseDamage?: number;
    };
  }>(
    "/api/battle/resolve",
    {
      schema: { body: resolveBodySchema }
    },
    async (request) => {
      return battleService.resolveChallenge(request.body);
    }
  );

  app.post<{
    Body: {
      verbInfinitive: string;
      tenseId: string;
      pronounId: string;
      targetScope: "single" | "plural";
      answer: string;
      baseDamage?: number;
    };
  }>(
    "/api/battle/evaluate",
    {
      schema: { body: evaluateBodySchema }
    },
    async (request) => {
      return battleService.evaluateCombat(request.body);
    }
  );

  app.post(
    "/api/admin/verbs",
    {
      schema: { body: addVerbBodySchema }
    },
    async (request, reply) => {
      const verb = await lexiconService.addVerb(
        request.body as Parameters<typeof lexiconService.addVerb>[0]
      );
      reply.code(201);
      return { verb };
    }
  );

  app.post(
    "/api/admin/tenses",
    {
      schema: { body: addTenseBodySchema }
    },
    async (request, reply) => {
      const tense = await lexiconService.addTense(
        request.body as Parameters<typeof lexiconService.addTense>[0]
      );
      reply.code(201);
      return { tense };
    }
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ error: error.message });
      return;
    }

    if ((error as { validation?: unknown }).validation) {
      reply.code(400).send({ error: toErrorMessage(error) });
      return;
    }

    request.log.error({ err: error }, "Unhandled request error");
    reply.code(500).send({ error: "Internal Server Error" });
  });

  return app;
}
