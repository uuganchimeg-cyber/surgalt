export type HomeworkAttachment = {
  name: string;
  resourceType?: "image" | "raw";
  url?: string;
  publicId?: string;
};

export type HomeworkAssignment = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  dueDate: string;
  attachment?: HomeworkAttachment;
};

export type HomeworkSubmission = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: number;
  student: string;
  fileName: string;
  resourceType?: "image" | "raw";
  submittedAt: string;
  counted: boolean;
  url?: string;
  publicId?: string;
};

export type HomeworkSection = "received" | "teacher" | "send";

export type NewHomeworkAssignment = Omit<
  HomeworkAssignment,
  "id" | "createdAt"
>;

export function formatHomeworkDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  const formattedDate = `${date.getFullYear()} оны ${date.getMonth() + 1}-р сарын ${date.getDate()}`;
  if (value.length === 10) return formattedDate;

  const time = [date.getHours(), date.getMinutes()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return `${formattedDate} · ${time}`;
}
