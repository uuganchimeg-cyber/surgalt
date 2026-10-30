import { z } from "zod";
import { apiErrorResponse, assertSameOrigin } from "@/lib/api-response";
import { adminDatabase } from "@/lib/firebase-admin";
import {
  ApiError,
  clearSessionCookie,
  getAuthenticatedUser,
  setSessionCookie,
} from "@/lib/server-auth";

const sessionRequestSchema = z.object({
  idToken: z.string().min(1),
});

export async function GET() {
  try {
    const { profile } = await getAuthenticatedUser();
    const data =
      profile.role === "student"
        ? (
            await adminDatabase()
              .ref(`appData/students/${profile.studentId}`)
              .get()
          ).val()
        : null;
    return Response.json({
      session:
        profile.role === "teacher"
          ? { role: profile.role }
          : { role: profile.role, studentId: profile.studentId },
      student: data,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return Response.json({ session: null }, { status: 200 });
    }
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = sessionRequestSchema.parse(await request.json());
    const { profile } = await setSessionCookie(body.idToken);
    return Response.json({
      session:
        profile.role === "teacher"
          ? { role: profile.role }
          : { role: profile.role, studentId: profile.studentId },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
