import { z } from "zod";
import type { DashboardNotification } from "@/components/notification-data";
import { apiErrorResponse, assertSameOrigin } from "@/lib/api-response";
import { adminDatabase } from "@/lib/firebase-admin";
import { getAuthenticatedUser } from "@/lib/server-auth";

const notificationIdSchema = z.string().regex(/^[a-f0-9-]{36}$/i);
const readNotificationSchema = z.union([
  z.object({ id: notificationIdSchema }).strict(),
  z.object({ ids: z.array(notificationIdSchema).min(1).max(50) }).strict(),
]);

function recipientKey(profile: Awaited<ReturnType<typeof getAuthenticatedUser>>["profile"]) {
  return profile.role === "teacher" ? "teacher" : `student:${profile.studentId}`;
}

export async function GET() {
  try {
    const { profile } = await getAuthenticatedUser();
    const snapshot = await adminDatabase()
      .ref(`appData/notifications/${recipientKey(profile)}`)
      .get();
    const notifications = Object.values(
      (snapshot.val() ?? {}) as Record<string, DashboardNotification>,
    ).sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return Response.json(
      { notifications },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { profile } = await getAuthenticatedUser();
    const body = readNotificationSchema.parse(await request.json());
    const ids = "id" in body ? [body.id] : body.ids;
    const notificationsRef = adminDatabase().ref(
      `appData/notifications/${recipientKey(profile)}`,
    );
    const snapshot = await notificationsRef.get();
    const readAt = new Date().toISOString();
    const updates: Record<string, string> = {};
    for (const id of ids) {
      const notification = snapshot.child(id);
      if (!notification.exists()) {
        if ("id" in body) {
          return Response.json({ error: "Мэдэгдэл олдсонгүй." }, { status: 404 });
        }
        continue;
      }
      if (!notification.child("readAt").exists()) {
        updates[`${id}/readAt`] = readAt;
      }
    }
    if (Object.keys(updates).length) await notificationsRef.update(updates);
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
