import "server-only";

import { ZodError } from "zod";
import { ApiError } from "./server-auth";

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Илгээсэн мэдээллийн формат буруу байна." },
      { status: 400 },
    );
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code);
    if (code === "auth/email-already-exists") {
      return Response.json(
        { error: "Энэ имэйл Firebase Authentication-д бүртгэлтэй байна." },
        { status: 409 },
      );
    }
    if (code === "auth/invalid-email" || code === "auth/invalid-password") {
      return Response.json(
        { error: "Firebase хэрэглэгчийн имэйл эсвэл нууц үгийн формат буруу байна." },
        { status: 400 },
      );
    }
  }

  console.error("API request failed.", {
    name: error instanceof Error ? error.name : "UnknownError",
    code:
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined,
  });
  return Response.json(
    { error: "Серверийн хүсэлтийг боловсруулахад алдаа гарлаа." },
    { status: 500 },
  );
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new ApiError("Хүсэлтийн эх сурвалж зөвшөөрөгдөөгүй байна.", 403);
  }
  try {
    if (new URL(origin).origin === new URL(request.url).origin) return;
  } catch {
    throw new ApiError("Хүсэлтийн эх сурвалж зөвшөөрөгдөөгүй байна.", 403);
  }
  throw new ApiError("Хүсэлтийн эх сурвалж зөвшөөрөгдөөгүй байна.", 403);
}
