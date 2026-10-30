"use client";

export type HomeworkUploadPurpose =
  | "homework-assignment"
  | "homework-submission";

type UploadPurpose = "announcement" | "profile" | HomeworkUploadPurpose;
type CloudinaryResourceType = "image" | "raw";

type UploadSignature = {
  cloudName: string;
  apiKey: string;
  signature: string;
  timestamp: number;
  folder: string;
  publicId: string;
  allowedFormats: string;
  context: string;
  resourceType: CloudinaryResourceType;
};

type CloudinaryUpload = {
  secure_url: string;
  public_id: string;
  original_filename: string;
  format: string;
  resource_type: string;
};

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const homeworkExtensions = new Set([
  ...imageExtensions,
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
]);

function getFileExtension(file: File) {
  return file.name.split(".").at(-1)?.toLowerCase() ?? "";
}

async function uploadFile(file: File, purpose: UploadPurpose) {
  const extension = getFileExtension(file);
  const allowedExtensions =
    purpose === "announcement" || purpose === "profile"
      ? imageExtensions
      : homeworkExtensions;
  if (!allowedExtensions.has(extension)) {
    throw new Error(
      purpose === "announcement" || purpose === "profile"
        ? "JPG, PNG, WEBP зураг сонгоно уу."
        : "PDF, Word, PowerPoint, Excel эсвэл зураг файл сонгоно уу.",
    );
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Файлын хэмжээ 10MB-аас их байж болохгүй.");
  }

  const resourceType: CloudinaryResourceType =
    imageExtensions.has(extension) || extension === "pdf" ? "image" : "raw";
  const signatureResponse = await fetch("/api/uploads/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, extension }),
  });
  const signaturePayload = (await signatureResponse.json()) as
    | UploadSignature
    | { error?: string };
  if (!signatureResponse.ok || !("signature" in signaturePayload)) {
    throw new Error(
      "error" in signaturePayload
        ? signaturePayload.error ?? "Файл илгээх зөвшөөрөл авч чадсангүй."
        : "Файл илгээх зөвшөөрөл авч чадсангүй.",
    );
  }

  if (signaturePayload.resourceType !== resourceType) {
    throw new Error("Файлын төрөл таарахгүй байна.");
  }

  const formData = new FormData();
  formData.set("file", file);
  formData.set("api_key", signaturePayload.apiKey);
  formData.set("timestamp", String(signaturePayload.timestamp));
  formData.set("folder", signaturePayload.folder);
  formData.set("public_id", signaturePayload.publicId);
  formData.set("allowed_formats", signaturePayload.allowedFormats);
  formData.set("context", signaturePayload.context);
  formData.set("overwrite", "false");
  formData.set("signature", signaturePayload.signature);

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signaturePayload.cloudName)}/${signaturePayload.resourceType}/upload`,
    { method: "POST", body: formData },
  );
  const uploadPayload = (await uploadResponse.json()) as
    | CloudinaryUpload
    | { error?: { message?: string } };
  if (
    !uploadResponse.ok ||
    !("secure_url" in uploadPayload) ||
    uploadPayload.resource_type !== signaturePayload.resourceType
  ) {
    throw new Error(
      "error" in uploadPayload
        ? uploadPayload.error?.message ?? "Зургийг Cloudinary-д илгээж чадсангүй."
        : "Файлыг Cloudinary-д илгээж чадсангүй.",
    );
  }

  return {
    url: uploadPayload.secure_url,
    publicId: uploadPayload.public_id,
    fileName: file.name,
    resourceType,
  };
}

export async function uploadImage(file: File, purpose: "announcement") {
  const uploaded = await uploadFile(file, purpose);
  return {
    url: uploaded.url,
    publicId: uploaded.publicId,
    fileName: uploaded.fileName,
  };
}

export async function uploadProfileImage(file: File) {
  const uploaded = await uploadFile(file, "profile");
  return {
    url: uploaded.url,
    publicId: uploaded.publicId,
  };
}

export async function uploadHomeworkFile(
  file: File,
  purpose: HomeworkUploadPurpose,
) {
  return uploadFile(file, purpose);
}
