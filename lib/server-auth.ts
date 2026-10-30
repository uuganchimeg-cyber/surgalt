import "server-only";

import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDatabase } from "./firebase-admin";

export const SESSION_COOKIE = "__session";
const SESSION_TTL_MS = 5 * 24 * 60 * 60 * 1000;

export type UserProfile =
  | { role: "teacher"; uid: string }
  | { role: "student"; uid: string; studentId: number };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function verifyIdToken(idToken: string) {
  const auth = adminAuth();
  try {
    return await auth.verifyIdToken(idToken, true);
  } catch {
    throw new ApiError("Нэвтрэх эрхийн мэдээлэл хүчингүй байна.", 401);
  }
}

export async function setSessionCookie(idToken: string) {
  const decoded = await verifyIdToken(idToken);
  const profile = await getUserProfile(decoded.uid);
  await assertProfileEnabled(profile);
  const sessionCookie = await adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_TTL_MS,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return { decoded, profile };
}

export async function getAuthenticatedUser(): Promise<{
  decoded: DecodedIdToken;
  profile: UserProfile;
}> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) throw new ApiError("Нэвтрэх шаардлагатай.", 401);

  const auth = adminAuth();
  let decoded: DecodedIdToken;
  try {
    decoded = await auth.verifySessionCookie(sessionCookie, true);
  } catch {
    throw new ApiError("Нэвтрэх хугацаа дууссан байна.", 401);
  }

  const profile = await getUserProfile(decoded.uid);
  await assertProfileEnabled(profile);
  return { decoded, profile };
}

export async function getUserProfile(uid: string): Promise<UserProfile> {
  const snapshot = await adminDatabase().ref(`users/${uid}`).get();
  const value = snapshot.val() as
    | { role?: unknown; studentId?: unknown }
    | null;
  if (value?.role === "teacher") return { role: "teacher", uid };

  if (
    value?.role === "student" &&
    Number.isSafeInteger(value.studentId) &&
    Number(value.studentId) > 0
  ) {
    return { role: "student", uid, studentId: Number(value.studentId) };
  }

  throw new ApiError("Энэ Firebase хэрэглэгчид сургалтын эрх тохируулаагүй байна.", 403);
}

async function assertProfileEnabled(profile: UserProfile) {
  if (profile.role !== "student") return;
  const student = await adminDatabase()
    .ref(`appData/students/${profile.studentId}`)
    .get();
  if (!student.exists() || student.child("accountActive").val() !== true) {
    throw new ApiError("Сурагчийн эрх идэвхгүй байна.", 403);
  }
}

export function requireTeacher(profile: UserProfile) {
  if (profile.role !== "teacher") {
    throw new ApiError("Энэ үйлдлийг зөвхөн багш хийх эрхтэй.", 403);
  }
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
