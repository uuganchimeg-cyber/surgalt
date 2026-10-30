import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiErrorResponse, assertSameOrigin } from "@/lib/api-response";
import { createCloudinaryUploadSignature } from "@/lib/cloudinary-server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { ApiError } from "@/lib/server-auth";

const requestSchema = z.object({
  purpose: z.enum([
    "announcement",
    "profile",
    "homework-assignment",
    "homework-submission",
  ]),
  extension: z.enum([
    "jpg",
    "jpeg",
    "png",
    "webp",
    "pdf",
    "doc",
    "docx",
    "ppt",
    "pptx",
    "xls",
    "xlsx",
  ]),
});

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { profile } = await getAuthenticatedUser();
    const { purpose, extension } = requestSchema.parse(await request.json());
    if (
      (purpose === "announcement" || purpose === "profile") &&
      !imageExtensions.has(extension)
    ) {
      throw new ApiError("JPG, PNG, WEBP зураг сонгоно уу.", 400);
    }
    if (purpose === "homework-submission" && profile.role !== "student") {
      throw new ApiError("Зөвхөн сурагч даалгаврын файл илгээх эрхтэй.", 403);
    }
    if (
      (purpose === "homework-assignment" || purpose === "announcement") &&
      profile.role !== "teacher"
    ) {
      throw new ApiError("Энэ файлыг зөвхөн багш нийтлэх боломжтой.", 403);
    }

    const folder =
      purpose === "announcement"
        ? "erdem/announcements"
        : purpose === "homework-assignment"
          ? "erdem/homework/assignments"
          : purpose === "homework-submission"
            ? `erdem/homework/submissions/${profile.uid}`
            : `erdem/profiles/${profile.uid}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const resourceType =
      imageExtensions.has(extension) || extension === "pdf" ? "image" : "raw";
    const publicId =
      resourceType === "raw"
        ? `${randomUUID()}.${extension}`
        : randomUUID();
    const allowedFormats = extension;
    const context = `uploader_uid=${profile.uid}`;
    const parameters = {
      timestamp,
      folder,
      public_id: publicId,
      allowed_formats: allowedFormats,
      overwrite: false,
      context,
    };
    const signature = createCloudinaryUploadSignature(parameters);

    return Response.json({
      ...signature,
      timestamp,
      folder,
      publicId,
      allowedFormats,
      context,
      resourceType,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
