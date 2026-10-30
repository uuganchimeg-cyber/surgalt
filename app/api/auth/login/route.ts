import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { apiErrorResponse, assertSameOrigin } from "@/lib/api-response";
import { adminAuth, adminDatabase } from "@/lib/firebase-admin";
import {
  claimLoginAttempt,
  clearLoginAttempts,
  createLoginCredential,
  normalizeUsername,
  loginCredentialPath,
  verifyLoginPin,
  type LoginCredential,
} from "@/lib/login-credentials";
import { ApiError, getUserProfile } from "@/lib/server-auth";

async function ensureDefaultTeacherCredential(
  database: ReturnType<typeof adminDatabase>,
) {
  const credentialRef = database.ref(loginCredentialPath("bagsh"));
  const currentCredential = (await credentialRef.get()).val() as
    | LoginCredential
    | null;

  if (currentCredential) {
    try {
      const user = await adminAuth().getUser(currentCredential.uid);
      const profile = (await database.ref(`users/${user.uid}`).get()).val() as
        | { role?: unknown; username?: unknown }
        | null;
      if (
        !user.disabled &&
        profile?.role === "teacher" &&
        (typeof profile.username !== "string" ||
          normalizeUsername(profile.username) === "bagsh")
      ) {
        return false;
      }
      if (
        profile?.role === "teacher" &&
        typeof profile.username === "string" &&
        normalizeUsername(profile.username) !== "bagsh"
      ) {
        await credentialRef.transaction((current) =>
          current?.uid === user.uid ? null : current,
        );
      }
    } catch {
      // Repair a stale default-teacher credential below.
    }
  }

  const users = (await database.ref("users").get()).val() as
    | Record<string, { role?: unknown; username?: unknown }>
    | null;
  let teacherUid: string | undefined;
  let hasActiveTeacher = false;

  for (const [uid, profile] of Object.entries(users ?? {})) {
    if (profile.role !== "teacher") continue;
    try {
      const user = await adminAuth().getUser(uid);
      if (!user.disabled) {
        hasActiveTeacher = true;
        if (
          typeof profile.username === "string" &&
          normalizeUsername(profile.username) !== "bagsh"
        ) {
          continue;
        }
        teacherUid = uid;
        break;
      }
    } catch {
      // Ignore orphaned teacher profiles and repair them with another account.
    }
  }

  if (!teacherUid && hasActiveTeacher) return false;

  if (!teacherUid) {
    const configuredTeacherEmail = process.env.FIREBASE_BOOTSTRAP_TEACHER_EMAIL?.trim();
    if (configuredTeacherEmail) {
      try {
        const user = await adminAuth().getUserByEmail(configuredTeacherEmail);
        if (!user.disabled) teacherUid = user.uid;
      } catch {
        // Use a dedicated Firebase identity when the configured account is absent.
      }
    }
  }

  if (!teacherUid) {
    const teacherEmail = "bagsh@accounts.surgalt.local";
    let user;
    try {
      user = await adminAuth().getUserByEmail(teacherEmail);
    } catch {
      user = await adminAuth().createUser({
        email: teacherEmail,
        password: randomUUID(),
        displayName: "Багш",
        disabled: false,
      });
    }
    if (user.disabled) {
      user = await adminAuth().updateUser(user.uid, { disabled: false });
    }
    teacherUid = user.uid;
  }

  const existingProfile = (await database.ref(`users/${teacherUid}`).get()).val() as
    | { role?: unknown; username?: string }
    | null;
  if (existingProfile && existingProfile.role !== "teacher") {
    throw new Error("The default teacher Firebase account is linked to another role.");
  }
  if (
    existingProfile?.username &&
    normalizeUsername(existingProfile.username) !== "bagsh"
  ) {
    return false;
  }

  await database.ref(`users/${teacherUid}`).update({
    role: "teacher",
    username: existingProfile?.username ?? "bagsh",
  });
  const credential = await createLoginCredential("bagsh", "1234", teacherUid);
  await credentialRef.set(credential);
  return true;
}

const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(28),
  pin: z.string().regex(/^\d{4}$/),
});

const invalidCredentials = () =>
  Response.json(
    { error: "Нэвтрэх нэр эсвэл 4 оронтой PIN буруу байна." },
    { status: 401 },
  );

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { username, pin } = loginRequestSchema.parse(await request.json());
    const adcFile = process.env.APPDATA
      ? join(process.env.APPDATA, "gcloud", "application_default_credentials.json")
      : join(homedir(), ".config", "gcloud", "application_default_credentials.json");
    if (
      process.env.NODE_ENV !== "production" &&
      !process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 &&
      !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
      !existsSync(adcFile)
    ) {
      throw new ApiError(
        "Firebase Admin-ийн service account тохиргоо алга. FIREBASE_SERVICE_ACCOUNT_BASE64 утгыг .env.local-д тохируулна уу.",
        503,
      );
    }
    const database = adminDatabase();

    if (normalizeUsername(username) === "bagsh") {
      const repairedTeacherCredential =
        await ensureDefaultTeacherCredential(database);
      if (repairedTeacherCredential) await clearLoginAttempts(database, username);
    }

    if (!(await claimLoginAttempt(database, username))) {
      return Response.json(
        { error: "Олон удаа буруу оролдсон тул 15 минутын дараа дахин оролдоно уу." },
        { status: 429 },
      );
    }

    let credential = (
      await database.ref(loginCredentialPath(username)).get()
    ).val() as LoginCredential | null;
    if (
      !credential ||
      normalizeUsername(credential.username) !== normalizeUsername(username) ||
      !(await verifyLoginPin(pin, credential))
    ) {
      return invalidCredentials();
    }

    const user = await adminAuth().getUser(credential.uid);
    if (user.disabled) return invalidCredentials();

    let profile;
    try {
      profile = await getUserProfile(credential.uid);
    } catch (error) {
      if (error instanceof ApiError) return invalidCredentials();
      throw error;
    }

    if (profile.role === "student") {
      const student = await database
        .ref(`appData/students/${profile.studentId}`)
        .get();
      if (!student.exists() || student.child("accountActive").val() !== true) {
        return invalidCredentials();
      }
    }

    const customToken = await adminAuth().createCustomToken(credential.uid);
    await clearLoginAttempts(database, username);
    return Response.json({ customToken });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
