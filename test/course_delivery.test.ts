import assert from "node:assert/strict";
import test from "node:test";
import { buildEducatorReport, deliveryState } from "../src/course_delivery.js";

test("a learner at the exact deadline remains due soon", () => {
  const deadline = new Date("2026-10-10T12:00:00.000Z");
  assert.equal(deliveryState(deadline, deadline), "due_soon");
  assert.equal(deliveryState(deadline, new Date("2026-10-10T12:00:00.001Z")), "closed");
});

test("the educator report carries the course decision and asset location", () => {
  const report = buildEducatorReport({
    courseId: "biology-101",
    lessonId: "cell-structure",
    learnerId: "learner-42",
    subject: "plant cells",
    learningObjective: "distinguish the cell wall from the membrane",
    deadline: "2026-10-11T12:00:00.000Z",
  }, "asset-42", "/assets/asset-42.png", new Date("2026-10-10T13:00:00.000Z"));

  assert.equal(report.state, "due_soon");
  assert.equal(report.assetPath, "/assets/asset-42.png");
  assert.equal(report.learnerId, "learner-42");
});
