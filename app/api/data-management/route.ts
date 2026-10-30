import { z } from "zod";
import type { Student } from "@/components/school-data";
import type { Announcement } from "@/components/management-page";
import type { HomeworkAssignment, HomeworkSubmission } from "@/components/homework-data";
import type { DashboardNotification } from "@/components/notification-data";
import type { GradeExam } from "@/components/grade-data";
import type { AttendanceRecords } from "@/components/attendance-data";
import {
  apiErrorResponse,
  assertSameOrigin,
} from "@/lib/api-response";
import {
  deleteCloudinaryCleanupAssets,
  listCloudinaryCleanupAssets,
} from "@/lib/cloudinary-server";
import { adminDatabase } from "@/lib/firebase-admin";
import {
  loginCredentialPath,
  type LoginCredential,
  verifyLoginPin,
} from "@/lib/login-credentials";
import {
  ApiError,
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

const recordKindSchema = z.enum([
  "attendance",
  "gradeExam",
  "gradeExamName",
  "homeworkAssignment",
  "homeworkSubmission",
  "announcement",
  "notification",
]);

const cleanupSelectionSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("database"),
    kind: recordKindSchema,
    key: z.string().min(1).max(160),
    recipientKey: z.string().max(40).optional(),
  }),
  z.object({
    source: z.literal("storage"),
    publicId: z.string().min(1).max(255),
    resourceType: z.enum(["image", "raw"]),
  }),
]);

const deleteRequestSchema = z.object({
  confirmed: z.literal(true),
  pin: z.string().regex(/^\d{4}$/),
  items: z.array(cleanupSelectionSchema).min(1).max(5000),
});

type CleanupSelection = z.infer<typeof cleanupSelectionSchema>;

function selectionId(selection: CleanupSelection) {
  return selection.source === "storage"
    ? `storage:${selection.resourceType}:${selection.publicId}`
    : `database:${selection.kind}:${selection.recipientKey ?? ""}:${selection.key}`;
}

function safeRecordKey(key: string) {
  return /^[A-Za-z0-9_-]{1,160}$/.test(key);
}

function safeCloudinaryPublicId(publicId: string) {
  return /^erdem\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(publicId);
}

function isStudentRecipientKey(value: string) {
  return /^student:[1-9]\d{0,8}$/.test(value);
}

function toDataItems(
  data: AppData,
  protectedAccountCounts: { users: number; loginCredentials: number },
) {
  const items: Array<Record<string, unknown>> = [];
  items.push({
    id: "protected:login-accounts",
    source: "protected",
    category: "teacher",
    label: "Нэвтрэх эрхийн бүртгэлүүд",
    detail: `${protectedAccountCounts.users} Firebase хэрэглэгчийн холбоос · ${protectedAccountCounts.loginCredentials} нэр/PIN эрхийн бүртгэл · энэ цэснээс устахгүй`,
    selectable: false,
  });
  const addRecord = (
    kind: z.infer<typeof recordKindSchema>,
    key: string,
    label: string,
    detail: string,
    createdAt?: string,
    recipientKey?: string,
  ) => {
    const selection: CleanupSelection = {
      source: "database",
      kind,
      key,
      ...(recipientKey ? { recipientKey } : {}),
    };
    items.push({
      id: selectionId(selection),
      source: "database",
      category: kind,
      label,
      detail,
      ...(createdAt ? { createdAt } : {}),
      selectable:
        (kind === "attendance"
          ? /^\d{4}-\d{2}-\d{2}$/.test(key)
          : safeRecordKey(key)) &&
        (kind !== "notification" ||
          recipientKey === "teacher" ||
          Boolean(recipientKey && isStudentRecipientKey(recipientKey))),
      selection,
    });
  };

  for (const [date, records] of Object.entries(data.attendance ?? {})) {
    const count = records && typeof records === "object" ? Object.keys(records).length : 0;
    addRecord("attendance", date, `Ирц · ${date}`, `${count} сурагчийн ирц`);
  }
  for (const [key, exam] of Object.entries(data.gradeExams ?? {})) {
    const scores = exam?.grades && typeof exam.grades === "object"
      ? Object.values(exam.grades).filter((score) => score !== null && score !== undefined).length
      : 0;
    addRecord(
      "gradeExam",
      key,
      exam?.title || "Шалгалтын дүн",
      `${exam?.date ?? "Огноогүй"} · ${exam?.status === "published" ? "Нийтэлсэн" : "Ноорог"} · ${scores} сурагч`,
    );
  }
  for (const [key, name] of Object.entries(data.gradeExamNames ?? {})) {
    addRecord("gradeExamName", key, name, "Шинэ шалгалтын дүн оруулахад ашиглах нэр");
  }
  for (const [key, assignment] of Object.entries(data.homeworkAssignments ?? {})) {
    addRecord(
      "homeworkAssignment",
      key,
      assignment?.title || "Багшийн даалгавар",
      `Дуусах хугацаа: ${assignment?.dueDate ?? "тодорхойгүй"}`,
      assignment?.createdAt,
    );
  }
  for (const [key, submission] of Object.entries(data.homeworkSubmissions ?? {})) {
    addRecord(
      "homeworkSubmission",
      key,
      submission?.fileName || submission?.assignmentTitle || "Илгээсэн даалгавар",
      `${submission?.student ?? "Сурагч"} · ${submission?.assignmentTitle ?? "Даалгавар"}`,
      submission?.submittedAt,
    );
  }
  for (const [key, announcement] of Object.entries(data.announcements ?? {})) {
    addRecord(
      "announcement",
      key,
      announcement?.title || "Нийтэлсэн мэдээлэл",
      `${announcement?.category ?? "Мэдээлэл"} · ${announcement?.audience ?? "Бүх сурагч"}`,
      announcement?.date,
    );
  }
  for (const [recipientKey, notifications] of Object.entries(data.notifications ?? {})) {
    for (const [key, notification] of Object.entries(notifications ?? {})) {
      const recipient = recipientKey === "teacher"
        ? "Багш"
        : isStudentRecipientKey(recipientKey)
          ? `Сурагч #${recipientKey.slice("student:".length)}`
          : "Хүлээн авагч";
      addRecord(
        "notification",
        key,
        notification?.message || "Мэдэгдэл",
        `${recipient}${notification?.readAt ? " · Уншсан" : " · Шинэ"}`,
        notification?.createdAt,
        recipientKey,
      );
    }
  }

  for (const [key, student] of Object.entries(data.students ?? {})) {
    items.push({
      id: `protected:student:${key}`,
      source: "protected",
      category: "student",
      label: student?.name || "Бүртгэлтэй сурагч",
      detail: "Нэвтрэх бүртгэл болон сурагчийн мэдээлэл хамгаалагдсан",
      selectable: false,
    });
  }

  return items;
}

async function verifyCleanupPin(uid: string, pin: string) {
  const database = adminDatabase();
  const attemptsRef = database.ref(`teacherCleanupAttempts/${uid}`);
  const now = Date.now();
  const attempts = (await attemptsRef.get()).val() as
    | { attempts?: number; lockedUntil?: number }
    | null;
  if (attempts?.lockedUntil && attempts.lockedUntil > now) {
    throw new ApiError("PIN олон удаа буруу тул түр түгжигдлээ. 15 минутын дараа оролдоно уу.", 429);
  }

  const user = (await database.ref(`users/${uid}`).get()).val() as
    | { username?: string }
    | null;
  const username = user?.username ?? "bagsh";
  const credential = (await database.ref(loginCredentialPath(username)).get()).val() as
    | LoginCredential
    | null;
  if (!credential || credential.uid !== uid) {
    throw new ApiError("Багшийн нэвтрэх эрхийн мэдээлэл олдсонгүй.", 409);
  }

  if (await verifyLoginPin(pin, credential)) {
    await attemptsRef.remove();
    return;
  }

  let locked = false;
  await attemptsRef.transaction((current) => {
    const state = current as { attempts?: number; lockedUntil?: number } | null;
    if (state?.lockedUntil && state.lockedUntil > now) {
      locked = true;
      return state;
    }
    const nextAttempts = (state?.attempts ?? 0) + 1;
    locked = nextAttempts >= 5;
    return {
      attempts: nextAttempts,
      ...(locked ? { lockedUntil: now + 15 * 60 * 1000 } : {}),
    };
  });
  if (locked) {
    throw new ApiError("PIN олон удаа буруу тул түр түгжигдлээ. 15 минутын дараа оролдоно уу.", 429);
  }
  throw new ApiError("Багшийн PIN буруу байна.", 400);
}

export async function GET() {
  try {
    const { profile } = await getAuthenticatedUser();
    requireTeacher(profile);
    const database = adminDatabase();
    const [snapshot, usersSnapshot, credentialsSnapshot, files] =
      await Promise.all([
        database.ref("appData").get(),
        database.ref("users").get(),
        database.ref("loginAccounts").get(),
        listCloudinaryCleanupAssets(),
      ]);
    const data = (snapshot.val() ?? {}) as AppData;
    const userRecords = usersSnapshot.val() as Record<string, unknown> | null;
    const credentialRecords = credentialsSnapshot.val() as
      | Record<string, unknown>
      | null;
    const fileItems = files.map((file) => {
      const selection: CleanupSelection = {
        source: "storage",
        publicId: file.publicId,
        resourceType: file.resourceType,
      };
      return {
        id: selectionId(selection),
        source: "storage",
        category: file.resourceType,
        label: file.publicId.split("/").at(-1) || file.publicId,
      detail: `${file.publicId.split("/").slice(0, -1).join("/")} · ${file.format.toUpperCase() || file.resourceType}`,
        createdAt: file.createdAt,
      bytes: file.bytes,
        url: file.secureUrl,
        selectable: true,
        selection,
      };
    });
    return Response.json({
      items: [
        ...toDataItems(data, {
          users: Object.keys(userRecords ?? {}).length,
          loginCredentials: Object.keys(credentialRecords ?? {}).length,
        }),
        ...fileItems,
      ],
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { profile } = await getAuthenticatedUser();
    requireTeacher(profile);
    const input = deleteRequestSchema.parse(await request.json());
    await verifyCleanupPin(profile.uid, input.pin);

    const selections = Array.from(
      new Map(input.items.map((item) => [selectionId(item), item])).values(),
    );
    const appDataUpdates: Record<string, null> = {};
    const failedIds: string[] = [];
    const fileSelections: Array<Extract<CleanupSelection, { source: "storage" }>> = [];

    for (const selection of selections) {
      if (selection.source === "storage") {
        if (!safeCloudinaryPublicId(selection.publicId)) {
          failedIds.push(selectionId(selection));
          continue;
        }
        fileSelections.push(selection);
        continue;
      }

      const { kind, key, recipientKey } = selection;
      if (kind === "attendance") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          failedIds.push(selectionId(selection));
          continue;
        }
        appDataUpdates[`attendance/${key}`] = null;
      } else if (kind === "notification") {
        if (
          !safeRecordKey(key) ||
          !recipientKey ||
          (recipientKey !== "teacher" && !isStudentRecipientKey(recipientKey))
        ) {
          failedIds.push(selectionId(selection));
          continue;
        }
        appDataUpdates[`notifications/${recipientKey}/${key}`] = null;
      } else {
        if (!safeRecordKey(key)) {
          failedIds.push(selectionId(selection));
          continue;
        }
        const root = {
          gradeExam: "gradeExams",
          gradeExamName: "gradeExamNames",
          homeworkAssignment: "homeworkAssignments",
          homeworkSubmission: "homeworkSubmissions",
          announcement: "announcements",
        }[kind];
        appDataUpdates[`${root}/${key}`] = null;
      }
    }

    let deletedCount = 0;
    if (Object.keys(appDataUpdates).length > 0) {
      try {
        await adminDatabase().ref("appData").update(appDataUpdates);
        deletedCount += Object.keys(appDataUpdates).length;
      } catch {
        for (const selection of selections) {
          if (selection.source === "database") failedIds.push(selectionId(selection));
        }
      }
    }

    const groupedFiles = new Map<"image" | "raw", string[]>();
    for (const selection of fileSelections) {
      const ids = groupedFiles.get(selection.resourceType) ?? [];
      ids.push(selection.publicId);
      groupedFiles.set(selection.resourceType, ids);
    }
    for (const [resourceType, publicIds] of groupedFiles) {
      for (let index = 0; index < publicIds.length; index += 100) {
        const chunk = publicIds.slice(index, index + 100);
        try {
          const result = await deleteCloudinaryCleanupAssets(chunk, resourceType);
          for (const publicId of chunk) {
            const status = result[publicId];
            if (status === "deleted" || status === "not found" || status === "not_found") {
              deletedCount += 1;
            }
            else failedIds.push(`storage:${resourceType}:${publicId}`);
          }
        } catch {
          failedIds.push(...chunk.map((publicId) => `storage:${resourceType}:${publicId}`));
        }
      }
    }

    return Response.json({
      deletedCount,
      failedIds: Array.from(new Set(failedIds)),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
