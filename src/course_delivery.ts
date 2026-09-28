export type DeliveryState = "available" | "due_soon" | "closed";

export interface CourseAssetRequest {
  courseId: string;
  lessonId: string;
  learnerId: string;
  subject: string;
  learningObjective: string;
  deadline: string;
}

export interface EducatorReport {
  courseId: string;
  lessonId: string;
  learnerId: string;
  assetId: string;
  state: DeliveryState;
  deadline: string;
  generatedAt: string;
  assetPath: string;
}

export function deliveryState(deadline: Date, now: Date): DeliveryState {
  const remaining = deadline.getTime() - now.getTime();
  if (remaining < 0) return "closed";
  if (remaining <= 24 * 60 * 60 * 1000) return "due_soon";
  return "available";
}

export function buildEducatorReport(
  request: CourseAssetRequest,
  assetId: string,
  assetPath: string,
  now: Date,
): EducatorReport {
  return {
    courseId: request.courseId,
    lessonId: request.lessonId,
    learnerId: request.learnerId,
    assetId,
    state: deliveryState(new Date(request.deadline), now),
    deadline: request.deadline,
    generatedAt: now.toISOString(),
    assetPath,
  };
}
