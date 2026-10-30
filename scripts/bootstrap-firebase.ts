import { loadEnvConfig } from "@next/env";
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import type { ServiceAccount } from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

loadEnvConfig(process.cwd());

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const teacherEmail =
    process.env.FIREBASE_BOOTSTRAP_TEACHER_EMAIL?.trim() ||
    "bagsh@accounts.surgalt.local";
  if (!projectId || !databaseURL || !serviceAccountBase64) {
    throw new Error(
      "FIREBASE_PROJECT_ID, database URL, and service account are required.",
    );
  }

  const serviceAccount = JSON.parse(
    Buffer.from(serviceAccountBase64, "base64").toString("utf8"),
  ) as {
    project_id?: string;
  };
  if (serviceAccount.project_id !== projectId) {
    throw new Error("Service account project does not match FIREBASE_PROJECT_ID.");
  }

  const app = initializeApp(
    { credential: cert(serviceAccount as ServiceAccount), databaseURL, projectId },
    "surgalt-bootstrap",
  );
  const auth = getAuth(app);
  const database = getDatabase(app);
  const dataRef = database.ref("appData");
  if ((await dataRef.get()).exists()) {
    throw new Error(
      "appData already exists. Bootstrap stops without overwriting existing school data.",
    );
  }

  let teacher;
  try {
    teacher = await auth.getUserByEmail(teacherEmail);
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "auth/user-not-found"
    ) {
      throw error;
    }
    teacher = await auth.createUser({
      email: teacherEmail,
      password: randomUUID(),
      displayName: "Багш",
      disabled: false,
    });
  }
  if (teacher.disabled) {
    throw new Error("Bootstrap teacher account is disabled in Firebase Authentication.");
  }
  const teacherUsername = "bagsh";
  const teacherSalt = randomBytes(16).toString("hex");
  const teacherPinHash = scryptSync("1234", teacherSalt, 64).toString("hex");
  const teacherCredentialPath = `loginAccounts/${createHash("sha256")
    .update(teacherUsername.normalize("NFKC").toLocaleLowerCase("mn-MN"))
    .digest("hex")}`;
  await database.ref().update({
    [teacherCredentialPath]: {
      uid: teacher.uid,
      username: teacherUsername,
      salt: teacherSalt,
      pinHash: teacherPinHash,
    },
    [`users/${teacher.uid}`]: { role: "teacher" },
    appData: {
      students: {},
      attendance: {},
      gradeExams: {},
      homeworkAssignments: {},
      homeworkSubmissions: {},
      announcements: {},
    },
  });

  console.log("Firebase initialized with one teacher and empty school data.");
  await deleteApp(app);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Firebase bootstrap failed.",
  );
  process.exitCode = 1;
});
