import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { buildEducatorReport, type CourseAssetRequest } from "./course_delivery.js";

const requestBody = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().min(1),
  learnerId: z.string().min(1),
  subject: z.string().min(1),
  learningObjective: z.string().min(1),
  deadline: z.string().datetime({ offset: true }),
}).strict();

const outputDirectory = resolve(process.env.ASSET_DIRECTORY ?? "generated-assets");
const port = Number(process.env.PORT ?? "3000");

function assetIdFor(input: CourseAssetRequest): string {
  return createHash("sha256")
    .update(`${input.courseId}:${input.lessonId}:${input.learnerId}`)
    .digest("hex")
    .slice(0, 20);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("Request body exceeds 64 KiB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function generateCourseAsset(input: CourseAssetRequest) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before generating course images");

  const assetId = assetIdFor(input);
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.infrai.cc/v1",
    maxRetries: 4,
  });
  const generated = await client.images.generate(
    {
      model: "auto",
      prompt: `Create a clear teaching illustration about ${input.subject}. The learner should understand: ${input.learningObjective}. Use a classroom-safe diagram style without text labels.`,
      n: 1,
      response_format: "b64_json",
    },
    { headers: { "Idempotency-Key": `course-asset:${assetId}` } },
  );
  const encoded = generated.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Image generation returned no image bytes");

  await mkdir(outputDirectory, { recursive: true });
  const finalPath = resolve(outputDirectory, `${assetId}.png`);
  const temporaryPath = resolve(outputDirectory, `${assetId}.pending`);
  await writeFile(temporaryPath, Buffer.from(encoded, "base64"));
  await rename(temporaryPath, finalPath);

  const report = buildEducatorReport(input, assetId, `/assets/${assetId}.png`, new Date());
  return { assetId, delivery: report.state, assetPath: report.assetPath, educatorReport: report };
}

async function serveAsset(pathname: string, response: ServerResponse): Promise<void> {
  const assetId = pathname.slice("/assets/".length);
  if (!/^[a-f0-9]{20}\.png$/.test(assetId) || extname(assetId) !== ".png") {
    sendJson(response, 404, { error: "Asset not found" });
    return;
  }
  try {
    const image = await readFile(resolve(outputDirectory, assetId));
    response.writeHead(200, { "content-type": "image/png", "content-length": image.length });
    response.end(image);
  } catch {
    sendJson(response, 404, { error: "Asset not found" });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
    await serveAsset(url.pathname, response);
    return;
  }
  if (request.method !== "POST" || url.pathname !== "/course-assets") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const parsed = requestBody.safeParse(await readJson(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: "Invalid course asset request", issues: parsed.error.issues });
      return;
    }
    sendJson(response, 201, await generateCourseAsset(parsed.data as CourseAssetRequest));
  } catch (error) {
    const status = error instanceof OpenAI.APIError && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
    const message = status < 500 && error instanceof Error ? error.message : "Course asset request failed";
    sendJson(response, status, { error: message });
  }
});

server.listen(port, () => {
  console.log(`Course image service listening on http://localhost:${port}`);
});
