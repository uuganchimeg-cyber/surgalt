import { z } from "zod";
import type { Student } from "@/components/school-data";
import { apiErrorResponse, assertSameOrigin } from "@/lib/api-response";
import {
  deleteCloudinaryImage,
  getCloudinaryImageUrlOwnedBy,
} from "@/lib/cloudinary-server";
import { adminAuth, adminDatabase } from "@/lib/firebase-admin";
import {
  createLoginCredential,
  loginCredentialPath,
  normalizeUsername,
  removeLoginCredential,
  saveLoginCredential,
  verifyLoginPin,
  type LoginCredential,
} from "@/lib/login-credentials";
import { ApiError, getAuthenticatedUser } from "@/lib/server-auth";

const pinSchema = z.string().regex(/^\d{4}$/);
const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  username: z.string().trim().min(1).max(28).optional(),
  currentPin: pinSchema.optional(),
  newPin: pinSchema.optional(),
  profileImagePublicId: z.string().trim().min(1).max(200).nullable().optional(),
}).superRefine((value, context) => {
  if (Boolean(value.currentPin) !== Boolean(value.newPin)) {
    context.addIssue({
      code: "custom",
      message: "PIN солихын тулд өмнөх болон шинэ PIN-ээ хамтад нь оруулна уу.",
      path: ["newPin"],
    });
  }
  if (
    value.name === undefined &&
    value.username === undefined &&
    value.profileImagePublicId === undefined &&
    value.newPin === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Шинэчлэх профайлын мэдээллээ оруулна уу.",
    });
  }
});

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export async function GET() {
  try {
    const { profile } = await getAuthenticatedUser();
    const database = adminDatabase();

    if (profile.role === "student") {
      const snapshot = await database
        .ref(`appData/students/${profile.studentId}`)
        .get();
      const student = snapshot.val() as Student | null;
      if (!student || student.authUid !== profile.uid) {
        throw new ApiError("Сурагчийн бүртгэл олдсонгүй.", 404);
      }
      return Response.json({
        profile: {
          name: student.name,
          username: student.username,
          profileImageUrl: student.profileImageUrl ?? null,
          profileImagePublicId: student.profileImagePublicId ?? null,
        },
      });
    }

    const [profileSnapshot, authUser] = await Promise.all([
      database.ref(`users/${profile.uid}`).get(),
      adminAuth().getUser(profile.uid),
    ]);
    const teacher = profileSnapshot.val() as
      | {
          displayName?: string;
          username?: string;
          profileImageUrl?: string;
          profileImagePublicId?: string;
        }
      | null;
    return Response.json({
      profile: {
        name: teacher?.displayName ?? authUser.displayName ?? "Багш",
        username: teacher?.username ?? "bagsh",
        profileImageUrl: teacher?.profileImageUrl ?? null,
        profileImagePublicId: teacher?.profileImagePublicId ?? null,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const { profile } = await getAuthenticatedUser();
    const input = profileUpdateSchema.parse(await request.json());
    const database = adminDatabase();
    const profileRef =
      profile.role === "student"
        ? database.ref(`appData/students/${profile.studentId}`)
        : database.ref(`users/${profile.uid}`);
    const profileSnapshot = await profileRef.get();
    if (!profileSnapshot.exists()) {
      throw new ApiError("Профайл бүртгэл олдсонгүй.", 404);
    }

    const existing = profileSnapshot.val() as
      | (Student & { displayName?: string })
      | {
          displayName?: string;
          username?: string;
          profileImageUrl?: string;
          profileImagePublicId?: string;
        };
    if (
      profile.role === "student" &&
      (existing as Student).authUid !== profile.uid
    ) {
      throw new ApiError("Энэ сурагчийн профайлыг засах эрхгүй байна.", 403);
    }

    const previousName =
      profile.role === "student"
        ? (existing as Student).name
        : existing.displayName ?? "Багш";
    const previousUsername = existing.username ?? "bagsh";
    const nextName = input.name ?? previousName;
    const nextUsername = input.username ?? previousUsername;
    if (
      input.username !== undefined &&
      profile.role === "student" &&
      normalizeUsername(nextUsername) === "bagsh"
    ) {
      throw new ApiError("Энэ нэвтрэх нэр ашиглах боломжгүй байна.", 409);
    }

    if (input.username !== undefined) {
      const allStudents = await database.ref("appData/students").get();
      const duplicateUsername = Object.values(
        (allStudents.val() ?? {}) as Record<string, Student>,
      ).some(
        (student) =>
          (profile.role !== "student" || student.id !== profile.studentId) &&
          normalizeUsername(student.username) === normalizeUsername(nextUsername),
      );
      if (duplicateUsername) {
        throw new ApiError("Энэ нэвтрэх нэр бүртгэлтэй байна.", 409);
      }
    }

    const previousImagePublicId = existing.profileImagePublicId ?? null;
    const updatesImage = Object.prototype.hasOwnProperty.call(
      input,
      "profileImagePublicId",
    );
    const nextImagePublicId = updatesImage
      ? input.profileImagePublicId ?? null
      : previousImagePublicId;
    let nextImageUrl = existing.profileImageUrl ?? null;
    if (updatesImage && nextImagePublicId !== previousImagePublicId) {
      nextImageUrl = nextImagePublicId
        ? await getCloudinaryImageUrlOwnedBy(nextImagePublicId, profile.uid)
        : null;
    }

    const credentialChanged =
      nextUsername !== previousUsername || Boolean(input.newPin);
    let previousCredential: LoginCredential | null = null;
    let credentialBackup: LoginCredential | null = null;
    let pendingCredential: LoginCredential | null = null;
    let credentialSaved = false;

    if (credentialChanged) {
      previousCredential = (
        await database.ref(loginCredentialPath(previousUsername)).get()
      ).val() as LoginCredential | null;
      if (!previousCredential || previousCredential.uid !== profile.uid) {
        throw new ApiError("Нэвтрэх эрхийн бүртгэл олдсонгүй.", 409);
      }
      if (
        input.newPin &&
        !(await verifyLoginPin(input.currentPin!, previousCredential))
      ) {
        throw new ApiError("Өмнөх PIN буруу байна.", 400);
      }

      pendingCredential = input.newPin
        ? await createLoginCredential(nextUsername, input.newPin, profile.uid)
        : { ...previousCredential, username: nextUsername };
      credentialBackup = (
        await database.ref(loginCredentialPath(nextUsername)).get()
      ).val() as LoginCredential | null;
      credentialSaved = await saveLoginCredential(database, pendingCredential);
      if (!credentialSaved) {
        throw new ApiError("Энэ нэвтрэх нэр бүртгэлтэй байна.", 409);
      }
    }

    const studentFields = {
      ...(input.name !== undefined
        ? { name: nextName, initials: initialsFor(nextName) }
        : {}),
      ...(input.username !== undefined ? { username: nextUsername } : {}),
      ...(updatesImage
        ? {
            profileImageUrl: nextImageUrl,
            profileImagePublicId: nextImagePublicId,
          }
        : {}),
    };

    try {
      if (profile.role === "student" && Object.keys(studentFields).length > 0) {
        let usedInitialStudentSnapshot = false;
        const updateResult = await profileRef.transaction((currentValue) => {
          const student = (currentValue ??
            (!usedInitialStudentSnapshot ? (existing as Student) : null)) as
            | Student
            | null;
          usedInitialStudentSnapshot = true;
          if (!student || student.authUid !== profile.uid) return;
          return { ...student, ...studentFields };
        });
        if (!updateResult.committed) {
          throw new ApiError("Сурагчийн профайлыг шинэчилж чадсангүй.", 409);
        }
      } else if (profile.role === "teacher") {
        const teacherFields = {
          ...(input.name !== undefined ? { displayName: nextName } : {}),
          ...(input.username !== undefined ? { username: nextUsername } : {}),
          ...(updatesImage
            ? {
                profileImageUrl: nextImageUrl,
                profileImagePublicId: nextImagePublicId,
              }
            : {}),
        };
        if (Object.keys(teacherFields).length > 0) {
          await profileRef.update(teacherFields);
        }
      }
    } catch (error) {
      if (credentialSaved && pendingCredential) {
        await database
          .ref(loginCredentialPath(pendingCredential.username))
          .transaction((current) =>
            current?.uid === profile.uid ? credentialBackup : current,
          );
      }
      throw error;
    }

    if (
      previousCredential &&
      pendingCredential &&
      loginCredentialPath(previousUsername) !==
        loginCredentialPath(pendingCredential.username)
    ) {
      await removeLoginCredential(database, previousUsername, profile.uid);
    }
    if (
      previousImagePublicId &&
      previousImagePublicId !== nextImagePublicId
    ) {
      await deleteCloudinaryImage(previousImagePublicId).catch(() => {});
    }

    return Response.json({
      profile: {
        name: nextName,
        username: nextUsername,
        profileImageUrl: nextImageUrl,
        profileImagePublicId: nextImagePublicId,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
