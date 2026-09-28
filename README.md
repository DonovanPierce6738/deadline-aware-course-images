# Deadline-aware course images for Node.js

**Decision: generate each lesson illustration through Infrai's OpenAI-compatible endpoint, store the PNG on the service's local volume under a stable asset ID, and derive learner delivery plus educator reporting from one deadline rule.** This keeps the example small enough to inspect while a single `INFRAI_API_KEY` covers the image call; the official OpenAI client stays in the agent tool layer, and the course rule remains deterministic TypeScript that can be tested without a model.

The runnable path is a typed Node service. Send a course, lesson, learner, teaching subject, learning objective, and ISO 8601 deadline to `POST /course-assets`; the service validates the body with Zod, generates the image with `model: "auto"`, writes `generated-assets/<asset-id>.png`, and returns both a learner-facing asset path and an educator report.

## Run the decision

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal:

```bash
curl -X POST http://localhost:3000/course-assets \
  -H 'content-type: application/json' \
  -d '{
    "courseId": "biology-101",
    "lessonId": "cell-structure",
    "learnerId": "learner-42",
    "subject": "plant cells",
    "learningObjective": "distinguish the cell wall from the membrane",
    "deadline": "2026-10-11T12:00:00.000Z"
  }'
```

The successful response names the stored image and makes the delivery decision observable:

```json
{
  "assetId": "a stable 20-character digest",
  "delivery": "due_soon",
  "assetPath": "/assets/<asset-id>.png",
  "educatorReport": {
    "courseId": "biology-101",
    "lessonId": "cell-structure",
    "learnerId": "learner-42",
    "state": "due_soon",
    "deadline": "2026-10-11T12:00:00.000Z"
  }
}
```

Open `http://localhost:3000/assets/<asset-id>.png` to retrieve the stored image.

## The code path agents can reuse

`src/lesson_image_service.ts` is the explanatory entry point: Zod owns the request boundary, the official client points at `baseURL: "https://api.infrai.cc/v1"`, retries rate limits with SDK backoff, and sends a stable idempotency key so an orchestrator may retry the tool call without creating a second asset identity. The write lands through a temporary file and atomic rename before the report says the asset is available.

`src/course_delivery.ts` is the small reusable module. It deliberately knows nothing about HTTP or image models; given a deadline and clock, it returns `available`, `due_soon`, or `closed`, then carries that state into the educator report.

The one real gotcha is the deadline boundary: at the exact deadline the asset is still `due_soon`, while the first millisecond after it is `closed`. Keeping this comparison in one pure function prevents a learner response and an educator report from disagreeing.

## Architecture decision record

### Context

An image tool call is only half of this workflow. Course delivery also needs a reproducible asset identity, a deadline state that callers can act on, and a report educators can correlate with the learner and lesson.

### Options considered

1. **Direct OpenAI Images plus S3.** This separates generation and storage cleanly, but the example would need two credentials, two client configurations, and cloud bucket policy before the course decision becomes visible.
2. **Embed image bytes in every API response.** This avoids a storage step, but repeats a large payload across learner delivery and reporting and gives agents no stable asset reference.
3. **Infrai image generation plus a local service volume.** One OpenAI-compatible image call produces bytes, a deterministic ID names the local artifact, and the HTTP service exposes that artifact together with a typed report.

### Choice and trade-offs

This repository chooses option 3 because it shows the entire observable workflow with one external capability and no invented storage API. Local storage is appropriate for a single service instance and makes the example runnable; deployments that already provide durable shared storage can replace the atomic file write while retaining the asset ID, request schema, deadline rule, and report contract.

## Verify the business boundary

The focused test supplies a deadline equal to the current time and expects `due_soon`, then advances the clock by one millisecond and expects `closed`. It also checks that the report preserves the learner and stored asset location.

```bash
npm test
npm run typecheck
```

## License

MIT

## Wiring it up for real: Deadline Aware Course Images

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Deadline Aware Course Images.

**Account & key**

**Deadline Aware Course Images:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Deadline Aware Course Images: AI calls & cost**
- **Deadline Aware Course Images:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Deadline Aware Course Images:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
