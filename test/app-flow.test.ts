import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../src/app.js";

test("root route serves browser game index page", async (t) => {
  const app = await buildServer();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/"
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/html/i);
  assert.match(response.body, /Portuguese Verb Battle/);
});

test("challenge flow resolves into deal damage on correct conjugation", async (t) => {
  const app = await buildServer();
  t.after(async () => {
    await app.close();
  });

  const challengeResponse = await app.inject({
    method: "GET",
    url: "/api/challenges/next?targetScope=single&verbInfinitive=falar&tenseId=present_indicative&pronounId=eu"
  });

  assert.equal(challengeResponse.statusCode, 200);
  const challenge = challengeResponse.json();

  const resolveResponse = await app.inject({
    method: "POST",
    url: "/api/battle/resolve",
    payload: {
      challengeId: challenge.challengeId,
      answer: "falo",
      baseDamage: 20
    }
  });

  assert.equal(resolveResponse.statusCode, 200);
  const result = resolveResponse.json();
  assert.equal(result.isCorrect, true);
  assert.equal(result.outcome, "deal");
  assert.ok(result.damage.dealt > 0);
  assert.equal(result.damage.mitigated, 0);
});

test("evaluate endpoint returns mitigation on wrong answer", async (t) => {
  const app = await buildServer();
  t.after(async () => {
    await app.close();
  });

  const evaluateResponse = await app.inject({
    method: "POST",
    url: "/api/battle/evaluate",
    payload: {
      verbInfinitive: "ter",
      tenseId: "present_indicative",
      pronounId: "voces",
      targetScope: "plural",
      answer: "somos",
      baseDamage: 30
    }
  });

  assert.equal(evaluateResponse.statusCode, 200);
  const result = evaluateResponse.json();
  assert.equal(result.isCorrect, false);
  assert.equal(result.outcome, "mitigate");
  assert.equal(result.damage.dealt, 0);
  assert.ok(result.damage.mitigated > 0);
});

test("challenge endpoint validates pronoun against scope", async (t) => {
  const app = await buildServer();
  t.after(async () => {
    await app.close();
  });

  const challengeResponse = await app.inject({
    method: "GET",
    url: "/api/challenges/next?targetScope=single&verbInfinitive=falar&tenseId=present_indicative&pronounId=nos"
  });

  assert.equal(challengeResponse.statusCode, 400);
  const payload = challengeResponse.json();
  assert.match(payload.error, /does not match target scope/i);
});
