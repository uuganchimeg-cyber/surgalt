import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Announcement,
} from "@/components/management-page";
import type {
  AttendanceRecords,
} from "@/components/attendance-data";
import { getDateKey } from "@/components/attendance-data";
import type { GradeExam } from "@/components/grade-data";
import {
  getStudentGradeStatus,
  normalizeGradeExamName,
} from "@/components/grade-data";
import type {
  HomeworkAssignment,
  HomeworkSubmission,
} from "@/components/homework-data";
import type { DashboardNotification } from "@/components/notification-data";
import type { Student } from "@/components/school-data";
import { apiErrorResponse, assertSameOrigin } from "@/lib/api-response";
import { assertCloudinaryAssetOwnedBy } from "@/lib/cloudinary-server";
import { adminAuth, adminDatabase } from "@/lib/firebase-admin";
import {
  createLoginCredential,
  loginCredentialPath,
  normalizeUsername,
  removeLoginCredential,
  saveLoginCredential,
  type LoginCredential,
} from "@/lib/login-credentials";
import {
  getAuthenticatedUser,
  requireTeacher,
} from "@/lib/server-auth";

type AppData = {
  students?: Record<string, Student>;
  attendance?: AttendanceRecords;
  gradeExams?: Record<string, GradeExam>;
  gradeExamNames?: Record<string, string>;
  homeworkAssignments?: Record<string, HomeworkAssignment>;
  homeworkSubmissions?: Record<string, HomeworkSubmission>;
  announcements?: Record<string, Announcement>;
  notifications?: Record<string, Record<string, DashboardNotification>>;
};

function addNotification(
  data: AppData,
  recipientKey: string,
  notification: Omit<DashboardNotification, "id" | "createdAt" | "readAt">,
) {
  data.notifications ??= {};
  const recipientNotifications = (data.notifications[recipientKey] ??= {});
  const id = randomUUID();
  recipientNotifications[id] = {
    ...notification,
    id,
    createdAt: new Date().toISOString(),
  };

  const olderNotifications = Object.values(recipientNotifications)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(50);
  for (const olderNotification of olderNotifications) {
    delete recipientNotifications[olderNotification.id];
  }
}

function notifyStudent(
  data: AppData,
  student: Student,
  notification: Omit<DashboardNotification, "id" | "createdAt" | "readAt">,
) {
  addNotification(data, `student:${student.id}`, notification);
}

const idSchema = z.number().int().positive();
const pinSchema = z.string().regex(/^\d{4}$/);
const studentFieldsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(5).max(30),
  username: z.string().trim().min(1).max(28),
  email: z.string().email().max(254).optional(),
});
const studentUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  username: z.string().trim().min(1).max(28).optional(),
  email: z.string().email().max(254).optional(),
  fee: z.enum(["Төлсөн", "Хүлээгдэж буй", "Дутуу төлсөн"]).optional(),
  lessonsInPackage: z.number().int().min(0).max(12).optional(),
});
const statusSchema = z.enum(["present", "absent", "excused"]).nullable();
const gradeExamSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["draft", "published"]),
  grades: z.record(z.string(), z.number().min(0).max(100).nullable()),
  studentStatuses: z.record(z.string(), z.enum(["draft", "published"])).optional(),
});
const gradeStudentSaveSchema = z.object({
  examId: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studentId: idSchema,
  grade: z.number().min(0).max(100),
  status: z.enum(["draft", "published"]),
});
const announcementSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  category: z.enum([
    "Мэдээ",
    "Зар",
    "Үйл ажиллагаа",
    "Анхааруулга",
    "Сануулга",
    "Мэдэгдэл",
  ]),
  audience: z.literal("Бүх сурагч"),
  imageUrl: z.string().url().optional(),
  imagePublicId: z.string().max(200).optional(),
  linkUrl: z.union([
    z.literal(""),
    z.string().trim().url().max(2048).refine(
      (value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      },
      "Линк https:// хаягтай байх ёстой.",
    ),
  ]).optional(),
}).superRefine((announcement, context) => {
  if (Boolean(announcement.imageUrl) !== Boolean(announcement.imagePublicId)) {
    context.addIssue({
      code: "custom",
      message: "Зургийн URL болон Cloudinary ID-г хамтад нь илгээнэ үү.",
      path: ["imageUrl"],
    });
  }
});
const assignmentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attachment: z
    .object({
      name: z.string().min(1).max(255),
      resourceType: z.enum(["image", "raw"]).default("image"),
      url: z.string().url(),
      publicId: z.string().min(1).max(200),
    })
    .optional(),
});
const mutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("attendance.set"), studentId: idSchema, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: statusSchema }),
  z.object({ type: z.literal("grade.save"), exam: gradeExamSchema }),
  z.object({ type: z.literal("grade.student.save") }).extend(gradeStudentSaveSchema.shape),
  z.object({ type: z.literal("grade.name.create"), name: z.string().trim().min(1).max(120) }),
  z.object({ type: z.literal("grade.delete"), examId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("student.create"), student: studentFieldsSchema, pin: pinSchema }),
  z.object({ type: z.literal("student.update"), studentId: idSchema, student: studentUpdateSchema, pin: pinSchema.optional(), accountActive: z.boolean().optional() }),
  z.object({ type: z.literal("payment.remind"), studentId: idSchema.optional() }),
  z.object({ type: z.literal("student.delete"), studentId: idSchema }),
  z.object({ type: z.literal("homework.assignment.create"), assignment: assignmentSchema }),
  z.object({ type: z.literal("homework.submission.create"), assignmentId: z.string().min(1).max(100), fileName: z.string().min(1).max(255), resourceType: z.enum(["image", "raw"]).default("image"), url: z.string().url(), publicId: z.string().min(1).max(200) }),
  z.object({ type: z.literal("homework.submission.toggle"), submissionId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("announcement.create"), announcement: announcementSchema }),
  z.object({ type: z.literal("announcement.update"), announcementId: z.string().min(1).max(100), announcement: announcementSchema }),
  z.object({ type: z.literal("announcement.delete"), announcementId: z.string().min(1).max(100) }),
]);

function validateCloudinaryAsset(
  urlValue: string,
  publicId: string,
  resourceType: "image" | "raw",
) {
  const url = new URL(urlValue);
  const lastPublicIdPart = publicId.split("/").at(-1) ?? "";
  const validPublicId =
    resourceType === "image"
      ? /^[0-9a-f-]{36}$/i.test(lastPublicIdPart)
      : /^[0-9a-f-]{36}\.(doc|docx|ppt|pptx|xls|xlsx)$/i.test(lastPublicIdPart);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "res.cloudinary.com" ||
    !validPublicId ||
    !url.pathname.includes(`/${resourceType}/upload/`)
  ) {
    throw new Error("Cloudinary файл баталгаажаагүй байна.");
  }
}

function recordValues<T>(value: Record<string, T> | undefined): T[] {
  return value ? Object.values(value) : [];
}

function getGradeExamNames(data: AppData) {
  const uniqueNames = new Map<string, string>();
  for (const name of [
    ...recordValues(data.gradeExamNames),
    ...recordValues(data.gradeExams).map((exam) => exam.title),
  ]) {
    const normalized = normalizeGradeExamName(name);
    if (!uniqueNames.has(normalized)) uniqueNames.set(normalized, name);
  }
  return Array.from(uniqueNames.values()).sort((left, right) =>
    left.localeCompare(right, "mn"),
  );
}

function formatStudentData(
  profile: Awaited<ReturnType<typeof getAuthenticatedUser>>["profile"],
  data: AppData,
) {
  const students = recordValues(data.students).sort((a, b) => a.id - b.id);
  const student =
    profile.role === "student"
      ? students.find((item) => item.id === profile.studentId)
      : undefined;

  if (profile.role === "teacher") {
    return {
      students,
      attendanceRecords: data.attendance ?? {},
      gradeExams: recordValues(data.gradeExams),
      gradeExamNames: getGradeExamNames(data),
      homeworkAssignments: recordValues(data.homeworkAssignments),
      homeworkSubmissions: recordValues(data.homeworkSubmissions),
      announcements: recordValues(data.announcements),
      notifications: recordValues(data.notifications?.teacher).sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt),
      ),
    };
  }

  if (!student) throw new Error("Student profile points to a missing student record.");

  const attendanceRecords = Object.fromEntries(
    Object.entries(data.attendance ?? {}).flatMap(([date, daily]) =>
      daily?.[profile.studentId]
        ? [[date, { [profile.studentId]: daily[profile.studentId] }]]
        : [],
    ),
  ) as AttendanceRecords;
  return {
    students: [student],
    attendanceRecords,
    gradeExams: recordValues(data.gradeExams)
      .filter(
        (exam) =>
          getStudentGradeStatus(exam, profile.studentId) === "published" &&
          exam.grades[profile.studentId] !== null &&
          exam.grades[profile.studentId] !== undefined,
      )
      .map((exam) => ({
        ...exam,
        grades: { [profile.studentId]: exam.grades[profile.studentId] ?? null },
        studentStatuses: {
          [profile.studentId]: getStudentGradeStatus(exam, profile.studentId),
        },
      })),
    gradeExamNames: [],
    homeworkAssignments: recordValues(data.homeworkAssignments),
    homeworkSubmissions: recordValues(data.homeworkSubmissions).filter(
      (submission) => submission.studentId === profile.studentId,
    ),
    announcements: recordValues(data.announcements),
    notifications: recordValues(
      data.notifications?.[`student:${profile.studentId}`],
    ).sort(
      (left, right) => right.createdAt.localeCompare(left.createdAt),
    ),
  };
}

export async function GET() {
  try {
    const { profile } = await getAuthenticatedUser();
    const snapshot = await adminDatabase().ref("appData").get();
    if (!snapshot.exists()) {
      return Response.json(
        { error: "Сургалтын өгөгдөл Firebase-д суулгагдаагүй байна." },
        { status: 503 },
      );
    }
    return Response.json(formatStudentData(profile, snapshot.val() as AppData));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { profile } = await getAuthenticatedUser();
    const mutation = mutationSchema.parse(await request.json());
    if (mutation.type === "homework.submission.create") {
      validateCloudinaryAsset(mutation.url, mutation.publicId, mutation.resourceType);
      await assertCloudinaryAssetOwnedBy(
        mutation.publicId,
        profile.uid,
        mutation.resourceType,
      );
    } else if (mutation.type === "homework.assignment.create") {
      if (mutation.assignment.attachment) {
        validateCloudinaryAsset(
          mutation.assignment.attachment.url,
          mutation.assignment.attachment.publicId,
          mutation.assignment.attachment.resourceType,
        );
        await assertCloudinaryAssetOwnedBy(
          mutation.assignment.attachment.publicId,
          profile.uid,
          mutation.assignment.attachment.resourceType,
        );
      }
    }

    if (mutation.type === "homework.submission.create") {
      if (profile.role !== "student") {
        return Response.json(
          { error: "Зөвхөн сурагч даалгавар илгээх боломжтой." },
          { status: 403 },
        );
      }
    } else {
      requireTeacher(profile);
    }

    const database = adminDatabase();
    const appDataRef = database.ref("appData");
    if (
      mutation.type === "announcement.create" ||
      mutation.type === "announcement.update"
    ) {
      let existingAnnouncement: Announcement | null = null;
      if (mutation.type === "announcement.update") {
        const existingSnapshot = await database
          .ref(`appData/announcements/${mutation.announcementId}`)
          .get();
        existingAnnouncement = existingSnapshot.val() as Announcement | null;
        if (!existingAnnouncement) {
          return Response.json(
            { error: "Мэдээлэл олдсонгүй." },
            { status: 404 },
          );
        }
      }
      if (mutation.announcement.imageUrl && mutation.announcement.imagePublicId) {
        validateCloudinaryAsset(
          mutation.announcement.imageUrl,
          mutation.announcement.imagePublicId,
          "image",
        );
        if (
          mutation.announcement.imagePublicId !==
          existingAnnouncement?.imagePublicId
        ) {
          await assertCloudinaryAssetOwnedBy(
            mutation.announcement.imagePublicId,
            profile.uid,
            "image",
          );
        }
      }
    }
    const initialAppDataSnapshot = await appDataRef.get();
    if (!initialAppDataSnapshot.exists()) {
      return Response.json(
        { error: "Сургалтын өгөгдөл Firebase-д суулгагдаагүй байна." },
        { status: 503 },
      );
    }
    const initialAppData = initialAppDataSnapshot.val() as AppData;
    let createdAuthUid: string | undefined;
    let updateAuthUid: string | undefined;
    let deletedAuthUid: string | undefined;
    let deletedUsername: string | undefined;
    let pendingCredential: LoginCredential | undefined;
    let credentialBackup: LoginCredential | null = null;
    let previousCredentialUsername: string | undefined;
    let credentialSaved = false;
    let uploadedImageToDelete: string | undefined;
    let mutationFailure: Error | undefined;

    if (mutation.type === "student.create") {
      if (normalizeUsername(mutation.student.username) === "bagsh") {
        return Response.json(
          { error: "Энэ нэвтрэх нэр ашиглах боломжгүй байна." },
          { status: 409 },
        );
      }
      const user = await adminAuth().createUser({
        email: `${randomUUID()}@accounts.surgalt.local`,
        password: randomUUID(),
        displayName: mutation.student.name,
        disabled: false,
      });
      createdAuthUid = user.uid;
      updateAuthUid = user.uid;
      pendingCredential = await createLoginCredential(
        mutation.student.username,
        mutation.pin,
        user.uid,
      );
    }

    if (mutation.type === "student.update") {
      if (
        mutation.student.username &&
        normalizeUsername(mutation.student.username) === "bagsh"
      ) {
        return Response.json(
          { error: "Энэ нэвтрэх нэр ашиглах боломжгүй байна." },
          { status: 409 },
        );
      }
      const current = await database
        .ref(`appData/students/${mutation.studentId}`)
        .get();
      const currentStudent = current.val() as Student | null;
      if (!currentStudent) {
        return Response.json({ error: "Сурагч олдсонгүй." }, { status: 404 });
      }
      if (mutation.student.username) {
        const allStudents = await database.ref("appData/students").get();
        const duplicateUsername = Object.values(
          (allStudents.val() ?? {}) as Record<string, Student>,
        ).some(
          (student) =>
            student.id !== mutation.studentId &&
            student.username.toLowerCase() ===
              mutation.student.username?.toLowerCase(),
        );
        if (duplicateUsername) {
          return Response.json(
            { error: "Энэ нэвтрэх нэр бүртгэлтэй байна." },
            { status: 409 },
          );
        }
      }
      updateAuthUid = currentStudent.authUid;
      if (!updateAuthUid && mutation.accountActive) {
        if (!mutation.pin) {
          return Response.json(
            { error: "Шинэ нэвтрэх эрхэд 4 оронтой PIN оруулна уу." },
            { status: 400 },
          );
        }
        const user = await adminAuth().createUser({
          email: `${randomUUID()}@accounts.surgalt.local`,
          password: randomUUID(),
          displayName: mutation.student.name ?? currentStudent.name,
          disabled: false,
        });
        createdAuthUid = user.uid;
        updateAuthUid = user.uid;
      } else if (updateAuthUid && mutation.accountActive !== undefined) {
        await adminAuth().updateUser(updateAuthUid, {
          disabled: !mutation.accountActive,
          ...(mutation.student.name ? { displayName: mutation.student.name } : {}),
        });
      }

      if (updateAuthUid && mutation.student.username) {
        previousCredentialUsername = currentStudent.username;
        if (mutation.pin) {
          pendingCredential = await createLoginCredential(
            mutation.student.username,
            mutation.pin,
            updateAuthUid,
          );
        } else if (currentStudent.username !== mutation.student.username) {
          const previous = (
            await database.ref(loginCredentialPath(currentStudent.username)).get()
          ).val() as LoginCredential | null;
          if (previous?.uid === updateAuthUid) {
            pendingCredential = {
              ...previous,
              username: mutation.student.username.trim(),
            };
          }
        }
      }
      if (createdAuthUid && updateAuthUid && mutation.type === "student.update") {
        pendingCredential = await createLoginCredential(
          mutation.student.username ?? currentStudent.username,
          mutation.pin!,
          updateAuthUid,
        );
      }
    }

    if (pendingCredential) {
      credentialBackup = (
        await database.ref(loginCredentialPath(pendingCredential.username)).get()
      ).val() as LoginCredential | null;
      credentialSaved = await saveLoginCredential(database, pendingCredential);
      if (!credentialSaved) {
        if (createdAuthUid) await adminAuth().deleteUser(createdAuthUid);
        return Response.json(
          { error: "Энэ нэвтрэх нэр бүртгэлтэй байна." },
          { status: 409 },
        );
      }
    }

    let usedInitialAppData = false;
    const transaction = await appDataRef.transaction((currentValue) => {
      const transactionValue =
        currentValue ?? (!usedInitialAppData ? initialAppData : null);
      usedInitialAppData = true;
      if (!transactionValue) {
        mutationFailure = new Error("Сургалтын өгөгдөл Firebase-д суулгагдаагүй байна.");
        return;
      }

      const data = transactionValue as AppData;
      data.students ??= {};
      data.attendance ??= {};
      data.gradeExams ??= {};
      data.gradeExamNames ??= {};
      data.homeworkAssignments ??= {};
      data.homeworkSubmissions ??= {};
      data.announcements ??= {};
      data.notifications ??= {};

      if (mutation.type === "attendance.set") {
        const student = data.students[String(mutation.studentId)];
        if (!student) {
          mutationFailure = new Error("Сурагч олдсонгүй.");
          return;
        }
        const daily = data.attendance[mutation.date] ?? {};
        const previous = daily[mutation.studentId];
        const nextStatus = mutation.status ?? undefined;
        if (nextStatus === "present" && previous !== "present" && student.fee !== "Төлсөн") {
          mutationFailure = new Error("Төлбөр бүрэн төлөгдөөгүй байна. Дараагийн хичээлд суухын өмнө төлбөрөө төлнө үү.");
          return;
        }
        const lessonDelta =
          Number(nextStatus === "present") - Number(previous === "present");
        const lessonsInPackage = Math.max(
          0,
          Math.min(12, student.lessonsInPackage + lessonDelta),
        );
        if (nextStatus) daily[mutation.studentId] = nextStatus;
        else delete daily[mutation.studentId];
        if (Object.keys(daily).length) data.attendance[mutation.date] = daily;
        else delete data.attendance[mutation.date];
        student.lessonsInPackage = lessonsInPackage;
        if (lessonsInPackage >= 12) student.fee = "Хүлээгдэж буй";
        student.attendance =
          mutation.date === getDateKey(new Date())
            ? nextStatus === "present"
              ? "Ирсэн"
              : nextStatus === "absent"
                ? "Тасалсан"
                : nextStatus === "excused"
                  ? "Чөлөөтэй"
                  : "Бүртгээгүй"
            : student.attendance;
        if (nextStatus && previous !== nextStatus) {
          const [year, month, day] = mutation.date.split("-").map(Number);
          const dateLabel = new Intl.DateTimeFormat("mn-MN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(year, month - 1, day, 12)));
          notifyStudent(data, student, {
            message: `${dateLabel}-ний ирц бүртгэгдлээ.`,
            page: "attendance",
          });
        }
      } else if (mutation.type === "grade.name.create") {
        const normalizedName = normalizeGradeExamName(mutation.name);
        const existingNames = [
          ...Object.values(data.gradeExamNames),
          ...Object.values(data.gradeExams).map((exam) => exam.title),
        ];
        if (existingNames.some(
          (name) => normalizeGradeExamName(name) === normalizedName,
        )) {
          mutationFailure = new Error("Энэ шалгалтын нэр бүртгэлтэй байна.");
          return;
        }
        data.gradeExamNames[`name-${randomUUID()}`] = mutation.name;
      } else if (mutation.type === "grade.student.save") {
        const student = data.students[String(mutation.studentId)];
        if (!student) {
          mutationFailure = new Error("Сурагч олдсонгүй.");
          return;
        }
        const previousExam = data.gradeExams[mutation.examId];
        const exam: GradeExam = previousExam ?? {
          id: mutation.examId,
          title: mutation.title,
          date: mutation.date,
          status: "draft" as const,
          grades: {},
        };
        const studentStatuses = Object.fromEntries(
          Object.entries(exam.grades)
            .filter(([, score]) => score !== null)
            .map(([studentKey]) => {
              const previousStatus = exam.studentStatuses?.[Number(studentKey)] ?? exam.status;
              return [studentKey, previousStatus];
            }),
        ) as Record<string, "draft" | "published">;
        const previousStudentStatus =
          studentStatuses[String(mutation.studentId)] ?? "draft";
        exam.title = mutation.title;
        exam.date = mutation.date;
        exam.grades = { ...exam.grades, [mutation.studentId]: mutation.grade };
        exam.studentStatuses = {
          ...studentStatuses,
          [mutation.studentId]: mutation.status,
        };
        exam.status = Object.values(exam.studentStatuses).includes("published")
          ? "published"
          : "draft";
        data.gradeExams[mutation.examId] = exam;
        const nameExists = Object.values(data.gradeExamNames).some(
          (name) => normalizeGradeExamName(name) === normalizeGradeExamName(mutation.title),
        );
        if (!nameExists) data.gradeExamNames[`name-${randomUUID()}`] = mutation.title;
        if (mutation.status === "published" && previousStudentStatus !== "published") {
          notifyStudent(data, student, {
            message: `${mutation.title} шалгалтын ${mutation.grade} онооны дүн нийтлэгдлээ.`,
            page: "grades",
          });
        }
      } else if (mutation.type === "grade.delete") {
        if (!data.gradeExams[mutation.examId]) {
          mutationFailure = new Error("Шалгалтын дүн олдсонгүй.");
          return;
        }
        delete data.gradeExams[mutation.examId];
      } else if (mutation.type === "grade.save") {
        const previousExam = data.gradeExams[mutation.exam.id];
        const normalizedExam = {
          ...mutation.exam,
          studentStatuses: mutation.exam.studentStatuses ?? Object.fromEntries(
            Object.entries(mutation.exam.grades)
              .filter(([, score]) => score !== null)
              .map(([studentId]) => [studentId, mutation.exam.status]),
          ),
        };
        data.gradeExams[mutation.exam.id] = normalizedExam;
        if (!Object.values(data.gradeExamNames).some(
          (name) => normalizeGradeExamName(name) === normalizeGradeExamName(mutation.exam.title),
        )) {
          data.gradeExamNames[`name-${randomUUID()}`] = mutation.exam.title;
        }
        for (const student of Object.values(data.students)) {
          const score = normalizedExam.grades[student.id];
          const nextStatus = getStudentGradeStatus(normalizedExam, student.id);
          const previousStatus = previousExam
            ? getStudentGradeStatus(previousExam, student.id)
            : "draft";
          if (score === null || score === undefined || nextStatus !== "published" || previousStatus === "published") continue;
            notifyStudent(data, student, {
              message: `${normalizedExam.title} шалгалтын ${score} онооны дүн нийтлэгдлээ.`,
              page: "grades",
            });
        }
      } else if (mutation.type === "student.create") {
        if (Object.values(data.students).some((item) =>
          item.username.toLowerCase() === mutation.student.username.toLowerCase(),
        )) {
          mutationFailure = new Error("Нэвтрэх нэр эсвэл имэйл бүртгэлтэй байна.");
          return;
        }
        const id =
          Math.max(0, ...Object.values(data.students).map((item) => item.id)) + 1;
        const initials = mutation.student.name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part.charAt(0))
          .join("")
          .toUpperCase();
        data.students[String(id)] = {
          ...mutation.student,
          id,
          initials,
          authUid: createdAuthUid,
          accountActive: true,
          attendance: "Бүртгээгүй",
          lessonsInPackage: 0,
          grade: 0,
          fee: "Төлсөн",
        };
      } else if (mutation.type === "student.update") {
        const student = data.students[String(mutation.studentId)];
        if (!student) {
          mutationFailure = new Error("Сурагч олдсонгүй.");
          return;
        }
        if (mutation.student.username && Object.values(data.students).some((item) =>
          item.id !== student.id &&
          item.username.toLowerCase() === mutation.student.username?.toLowerCase(),
        )) {
          mutationFailure = new Error("Энэ нэвтрэх нэр бүртгэлтэй байна.");
          return;
        }
        const previousFee = student.fee;
        Object.assign(student, mutation.student);
        if (mutation.student.name) {
          student.initials = mutation.student.name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0))
            .join("")
            .toUpperCase();
        }
        if (previousFee !== "Төлсөн" && student.fee === "Төлсөн") {
          notifyStudent(data, student, {
            message: "Таны төлбөр төлөгдсөнөөр бүртгэгдлээ.",
            page: "payments",
          });
        }
        if (updateAuthUid) student.authUid = updateAuthUid;
        if (mutation.accountActive !== undefined) {
          student.accountActive = mutation.accountActive;
        }
      } else if (mutation.type === "payment.remind") {
        const selectedStudent = mutation.studentId
          ? data.students[String(mutation.studentId)]
          : undefined;
        if (mutation.studentId && !selectedStudent) {
          mutationFailure = new Error("Сурагч олдсонгүй.");
          return;
        }
        const recipients = selectedStudent
          ? [selectedStudent]
          : Object.values(data.students).filter(
              (student) => student.fee !== "Төлсөн",
            );
        const payableStudents = recipients.filter(
          (student) => student.fee !== "Төлсөн",
        );
        if (!payableStudents.length) {
          mutationFailure = new Error("Сануулах төлбөртэй сурагч алга.");
          return;
        }
        for (const student of payableStudents) {
          notifyStudent(data, student, {
            message:
              student.fee === "Дутуу төлсөн"
                ? "Төлбөрийн үлдэгдлээ төлөхийг сануулж байна."
                : "Сургалтын төлбөрөө төлөхийг сануулж байна.",
            page: "payments",
          });
        }
      } else if (mutation.type === "student.delete") {
        const student = data.students[String(mutation.studentId)];
        if (!student) {
          mutationFailure = new Error("Сурагч олдсонгүй.");
          return;
        }
        deletedAuthUid = student.authUid;
        deletedUsername = student.username;
      uploadedImageToDelete = student.profileImagePublicId;
        delete data.students[String(mutation.studentId)];
        for (const [date, records] of Object.entries(data.attendance)) {
          delete records[mutation.studentId];
          if (!Object.keys(records).length) delete data.attendance[date];
        }
        for (const exam of Object.values(data.gradeExams)) {
          delete exam.grades[mutation.studentId];
          if (exam.studentStatuses) delete exam.studentStatuses[mutation.studentId];
        }
      } else if (mutation.type === "homework.assignment.create") {
        const id = `homework-${randomUUID()}`;
        data.homeworkAssignments[id] = {
          ...mutation.assignment,
          id,
          createdAt: new Date().toISOString(),
        };
        for (const student of Object.values(data.students)) {
          if (student.accountActive === false) continue;
          notifyStudent(data, student, {
            message: `“${mutation.assignment.title}” нэртэй шинэ даалгавар ирлээ.`,
            page: "homework",
            homeworkSection: "received",
          });
        }
      } else if (mutation.type === "homework.submission.create") {
        const student = data.students[String(profile.role === "student" ? profile.studentId : -1)];
        const assignment = data.homeworkAssignments[mutation.assignmentId];
        if (!student || !assignment) {
          mutationFailure = new Error("Сурагч эсвэл даалгавар олдсонгүй.");
          return;
        }
        const id = `submission-${randomUUID()}`;
        data.homeworkSubmissions[id] = {
          id,
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          studentId: student.id,
          student: student.name,
          fileName: mutation.fileName,
          resourceType: mutation.resourceType,
          submittedAt: new Date().toISOString(),
          counted: false,
          url: mutation.url,
          publicId: mutation.publicId,
        };
        addNotification(data, "teacher", {
          message: `${student.name} сурагч “${assignment.title}” даалгаврыг илгээлээ.`,
          page: "homework",
          homeworkSection: "received",
          submissionId: id,
        });
      } else if (mutation.type === "homework.submission.toggle") {
        const submission = data.homeworkSubmissions[mutation.submissionId];
        if (!submission) {
          mutationFailure = new Error("Илгээсэн даалгавар олдсонгүй.");
          return;
        }
        submission.counted = !submission.counted;
      } else if (mutation.type === "announcement.create") {
        const id = `announcement-${randomUUID()}`;
        const announcement = { ...mutation.announcement };
        if (!announcement.linkUrl) delete announcement.linkUrl;
        data.announcements[id] = {
          ...announcement,
          id,
          date: new Intl.DateTimeFormat("mn-MN", { timeZone: "Asia/Ulaanbaatar" }).format(new Date()),
        };
      } else if (mutation.type === "announcement.update") {
        const currentAnnouncement = data.announcements[mutation.announcementId];
        if (!currentAnnouncement) {
          mutationFailure = new Error("Мэдээлэл олдсонгүй.");
          return;
        }
        if (
          mutation.announcement.imagePublicId &&
          currentAnnouncement.imagePublicId &&
          mutation.announcement.imagePublicId !== currentAnnouncement.imagePublicId
        ) {
          uploadedImageToDelete = currentAnnouncement.imagePublicId;
        }
        const updatedAnnouncement = {
          ...currentAnnouncement,
          ...mutation.announcement,
          id: currentAnnouncement.id,
          date: currentAnnouncement.date,
        };
        if (mutation.announcement.linkUrl === "") {
          delete updatedAnnouncement.linkUrl;
        }
        data.announcements[mutation.announcementId] = updatedAnnouncement;
      } else if (mutation.type === "announcement.delete") {
        const announcement = data.announcements[mutation.announcementId];
        if (!announcement) {
          mutationFailure = new Error("Мэдээлэл олдсонгүй.");
          return;
        }
        uploadedImageToDelete = announcement.imagePublicId;
        delete data.announcements[mutation.announcementId];
      }
      return data;
    });

    if (mutationFailure) {
      if (credentialSaved && pendingCredential) {
        await database.ref(loginCredentialPath(pendingCredential.username)).transaction(
          (current) => current?.uid === pendingCredential?.uid ? credentialBackup : current,
        );
      }
      if (createdAuthUid) await adminAuth().deleteUser(createdAuthUid);
      return Response.json(
        { error: mutationFailure.message },
        { status: mutationFailure.message.includes("олдсонгүй") ? 404 : 400 },
      );
    }
    if (!transaction.committed) {
      if (credentialSaved && pendingCredential) {
        await database.ref(loginCredentialPath(pendingCredential.username)).transaction(
          (current) => current?.uid === pendingCredential?.uid ? credentialBackup : current,
        );
      }
      if (createdAuthUid) await adminAuth().deleteUser(createdAuthUid);
      return Response.json(
        { error: "Өгөгдөл шинэчлэгдсэнгүй. Дахин оролдоно уу." },
        { status: 409 },
      );
    }

    let newStudentId: number | undefined;
    transaction.snapshot.child("students").forEach((studentSnapshot) => {
      if (studentSnapshot.child("authUid").val() === createdAuthUid) {
        newStudentId = Number(studentSnapshot.key);
      }
    });
    if (mutation.type === "student.create" && createdAuthUid && newStudentId) {
      await database.ref(`users/${createdAuthUid}`).set({
        role: "student",
        studentId: Number(newStudentId),
      });
    } else if (
      mutation.type === "student.update" &&
      createdAuthUid &&
      updateAuthUid
    ) {
      await database.ref(`users/${createdAuthUid}`).set({
        role: "student",
        studentId: mutation.studentId,
      });
    }

    if (
      previousCredentialUsername &&
      pendingCredential &&
      loginCredentialPath(previousCredentialUsername) !==
        loginCredentialPath(pendingCredential.username)
    ) {
      await removeLoginCredential(
        database,
        previousCredentialUsername,
        pendingCredential.uid,
      );
    }

    if (mutation.type === "student.delete" && deletedAuthUid) {
      if (deletedUsername) {
        await removeLoginCredential(database, deletedUsername, deletedAuthUid);
      }
      await database.ref(`users/${deletedAuthUid}`).remove();
      await adminAuth().deleteUser(deletedAuthUid);
    }
    if (uploadedImageToDelete) {
      const { deleteCloudinaryImage } = await import("@/lib/cloudinary-server");
      await deleteCloudinaryImage(uploadedImageToDelete);
    }

    const snapshot = await database.ref("appData").get();
    return Response.json(formatStudentData(profile, snapshot.val() as AppData));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
