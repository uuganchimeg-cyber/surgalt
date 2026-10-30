import "server-only";

import { v2 as cloudinary } from "cloudinary";

let configured = false;

function configureCloudinary() {
  if (configured) return;
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudinaryUrl) throw new Error("Cloudinary server тохиргоо дутуу байна.");

  const parsed = new URL(cloudinaryUrl);
  if (
    parsed.protocol !== "cloudinary:" ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password
  ) {
    throw new Error("Cloudinary URL тохиргооны формат буруу байна.");
  }

  cloudinary.config({
    cloud_name: parsed.hostname,
    api_key: decodeURIComponent(parsed.username),
    api_secret: decodeURIComponent(parsed.password),
    secure: true,
  });
  configured = true;
}

export function createCloudinaryUploadSignature(parameters: {
  timestamp: number;
  folder: string;
  public_id: string;
  allowed_formats: string;
  overwrite: boolean;
  context: string;
}) {
  configureCloudinary();
  const cloudName = cloudinary.config().cloud_name;
  const apiKey = cloudinary.config().api_key;
  const apiSecret = cloudinary.config().api_secret;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary тохиргоог эхлүүлж чадсангүй.");
  }

  return {
    cloudName,
    apiKey,
    signature: cloudinary.utils.api_sign_request(parameters, apiSecret),
  };
}

export async function assertCloudinaryAssetOwnedBy(
  publicId: string,
  uid: string,
  resourceType: "image" | "raw",
) {
  configureCloudinary();
  const asset = await cloudinary.api.resource(publicId, {
    resource_type: resourceType,
  });
  if (
    asset.resource_type !== resourceType ||
    asset.context?.custom?.uploader_uid !== uid
  ) {
    throw new Error("Cloudinary файл энэ хэрэглэгчид хамаарахгүй байна.");
  }
}

export async function getCloudinaryImageUrlOwnedBy(
  publicId: string,
  uid: string,
) {
  configureCloudinary();
  const asset = await cloudinary.api.resource(publicId, {
    resource_type: "image",
  });
  if (
    asset.resource_type !== "image" ||
    asset.context?.custom?.uploader_uid !== uid ||
    typeof asset.secure_url !== "string"
  ) {
    throw new Error("Cloudinary зураг энэ хэрэглэгчид хамаарахгүй байна.");
  }
  return asset.secure_url;
}

export async function deleteCloudinaryImage(publicId: string) {
  configureCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error("Cloudinary зураг устгаж чадсангүй.");
  }
}

export type CloudinaryCleanupAsset = {
  publicId: string;
  resourceType: "image" | "raw";
  secureUrl: string;
  format: string;
  bytes: number;
  createdAt: string;
};

export async function listCloudinaryCleanupAssets() {
  configureCloudinary();
  const assets: CloudinaryCleanupAsset[] = [];

  for (const resourceType of ["image", "raw"] as const) {
    let nextCursor: string | undefined;
    do {
      const result = await cloudinary.api.resources({
        type: "upload",
        resource_type: resourceType,
        prefix: "erdem/",
        max_results: 500,
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
      });
      for (const asset of result.resources ?? []) {
        if (
          typeof asset.public_id !== "string" ||
          !asset.public_id.startsWith("erdem/") ||
          typeof asset.secure_url !== "string"
        ) {
          continue;
        }
        assets.push({
          publicId: asset.public_id,
          resourceType,
          secureUrl: asset.secure_url,
          format: typeof asset.format === "string" ? asset.format : "",
          bytes: typeof asset.bytes === "number" ? asset.bytes : 0,
          createdAt:
            typeof asset.created_at === "string" ? asset.created_at : "",
        });
      }
      nextCursor = result.next_cursor || undefined;
    } while (nextCursor);
  }

  return assets;
}

export async function deleteCloudinaryCleanupAssets(
  publicIds: string[],
  resourceType: "image" | "raw",
) {
  configureCloudinary();
  const result = await cloudinary.api.delete_resources(publicIds, {
    type: "upload",
    resource_type: resourceType,
    invalidate: true,
  });
  return (result.deleted ?? {}) as Record<string, string>;
}
