import type { PageId } from "./school-data";
import type { HomeworkSection } from "./homework-data";

export type DashboardNotification = {
  id: string;
  message: string;
  createdAt: string;
  page: Exclude<PageId, "overview" | "students" | "announcements">;
  homeworkSection?: HomeworkSection;
  submissionId?: string;
  readAt?: string;
};
