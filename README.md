## Portuguese Verb Battle Backend

Fast backend for a browser RPG where players conjugate Portuguese verbs to **deal damage** (correct) or **mitigate damage** (incorrect).

### Why this backend is suited for your game

- **Fast lookups:** all conjugations are precomputed at startup and stored in hash maps for O(1) validation.
- **Extensible lexicon:** verbs and tenses live in JSON (`data/verbs.json`, `data/tenses.json`) and can also be added via admin endpoints.
- **Irregular support:** per-verb/per-tense/per-pronoun overrides plus alternate accepted forms.
- **Target scope aware:** challenge generation enforces singular vs plural pronouns for single-target vs multi-target attacks.

## Stack

- Node.js + TypeScript
- Fastify (high-performance HTTP server)

## Quick start

```bash
npm install
npm run dev
```

Server defaults to `http://localhost:3000`.

Production build:

```bash
npm run build
npm start
```

Run tests:

```bash
npm test
```

## Data model

### Pronouns

Defined in `src/data/pronouns.ts` with person/number metadata.

### Tenses

Defined in `data/tenses.json`.

Each tense provides:
- `id`, `label`, `description`
- `base`: `"stem"` or `"infinitive"`
- `difficulty` (optional damage scaling)
- `regularEndings` for each verb group (`ar`, `er`, `ir`) and pronoun id

### Verbs

Defined in `data/verbs.json`.

Each verb supports:
- `infinitive`, `translation`
- optional `group` override
- optional `stems` per tense (e.g. future stem changes)
- optional `irregular` map by tense/pronoun
- optional alternate answers via arrays:
  - `"voce": ["aceita", "aceite"]`

## API

### Health

`GET /api/health`

### Reference data

`GET /api/reference`

Returns current pronouns, tenses, and verbs loaded by the engine.

### Create a challenge

`GET /api/challenges/next`

Query params:
- `targetScope`: `single | plural` (optional, random if omitted)
- `verbInfinitive` (optional)
- `tenseId` (optional)
- `pronounId` (optional, must match target scope)

Example:

```bash
curl "http://localhost:3000/api/challenges/next?targetScope=single&verbInfinitive=falar&tenseId=present_indicative&pronounId=eu"
```

### Resolve challenge (deal or mitigate)

`POST /api/battle/resolve`

```json
{
  "challengeId": "uuid",
  "answer": "falo",
  "baseDamage": 20
}
```

### Direct evaluation (without challenge lifecycle)

`POST /api/battle/evaluate`

```json
{
  "verbInfinitive": "ter",
  "tenseId": "present_indicative",
  "pronounId": "voces",
  "targetScope": "plural",
  "answer": "tem",
  "baseDamage": 30
}
```

## Admin endpoints (for adding content)

### Add a verb

`POST /api/admin/verbs`

### Add a tense

`POST /api/admin/tenses`

These endpoints persist changes back into `data/*.json` and rebuild the in-memory conjugation index.

## Performance notes

- Conjugations are computed once during initialization, not per request.
- Validation compares normalized strings (case/diacritic insensitive).
- Challenge state is in-memory with TTL cleanup for low-latency gameplay loops.
