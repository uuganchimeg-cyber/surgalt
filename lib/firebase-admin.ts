import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

function getAdminApp() {
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!databaseURL || !projectId) {
    throw new Error("Firebase server-ийн project/database тохиргоо дутуу байна.");
  }

  if (getApps().length) return getApps()[0];

  const credential = serviceAccountBase64
    ? cert(
        JSON.parse(
          Buffer.from(serviceAccountBase64, "base64").toString("utf8"),
        ),
      )
    : applicationDefault();

  return initializeApp({
    credential,
    databaseURL,
    projectId,
  });
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminDatabase() {
  return getDatabase(getAdminApp());
}
