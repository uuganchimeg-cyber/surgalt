export type GradeExam = {
  id: string;
  title: string;
  date: string;
  status: "draft" | "published";
  grades: Record<number, number | null>;
  studentStatuses?: Record<number, "draft" | "published">;
};

export type GradeStudentSave = {
  examId: string;
  title: string;
  date: string;
  studentId: number;
  grade: number;
  status: "draft" | "published";
};

export function normalizeGradeExamName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function getStudentGradeStatus(
  exam: GradeExam,
  studentId: number,
): GradeExam["status"] {
  return exam.studentStatuses?.[studentId] ?? exam.status;
}

export function formatExamDate(date: string) {
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}
