import "server-only";

import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { Database } from "firebase-admin/database";

const HASH_LENGTH = 64;

export type LoginCredential = {
  uid: string;
  username: string;
  salt: string;
  pinHash: string;
};

export function normalizeUsername(username: string) {
  return username.trim().normalize("NFKC").toLocaleLowerCase("mn-MN");
}

export function loginCredentialKey(username: string) {
  return createHash("sha256").update(normalizeUsername(username)).digest("hex");
}

export function loginCredentialPath(username: string) {
  return `loginAccounts/${loginCredentialKey(username)}`;
}

export function loginAttemptPath(username: string) {
  return `loginAttempts/${loginCredentialKey(username)}`;
}

export async function createLoginCredential(
  username: string,
  pin: string,
  uid: string,
): Promise<LoginCredential> {
  const salt = randomBytes(16).toString("hex");
  return {
    uid,
    username: username.trim(),
    salt,
    pinHash: (await derivePinHash(pin, salt)).toString("hex"),
  };
}

export async function verifyLoginPin(
  pin: string,
  credential: LoginCredential,
) {
  const expected = Buffer.from(credential.pinHash, "hex");
  const actual = await derivePinHash(pin, credential.salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function saveLoginCredential(
  database: Database,
  credential: LoginCredential,
) {
  const result = await database
    .ref(loginCredentialPath(credential.username))
    .transaction((current) => {
      if (current && current.uid !== credential.uid) return;
      return credential;
    });
  return result.committed;
}

export async function removeLoginCredential(
  database: Database,
  username: string,
  uid: string,
) {
  const ref = database.ref(loginCredentialPath(username));
  await ref.transaction((current) =>
    current?.uid === uid ? null : current,
  );
}

export async function claimLoginAttempt(database: Database, username: string) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;
  const result = await database.ref(loginAttemptPath(username)).transaction((value) => {
    const current = value as
      | { windowStartedAt?: number; attempts?: number; lockedUntil?: number }
      | null;
    if (current?.lockedUntil && current.lockedUntil > now) return current;

    const isNewWindow =
      !current?.windowStartedAt || now - current.windowStartedAt >= windowMs;
    const windowStartedAt = isNewWindow ? now : current.windowStartedAt!;
    const attempts = isNewWindow ? 0 : current.attempts ?? 0;
    if (attempts >= maxAttempts) {
      return { windowStartedAt, attempts, lockedUntil: windowStartedAt + windowMs };
    }

    return { windowStartedAt, attempts: attempts + 1 };
  });
  const state = result.snapshot.val() as
    | { attempts?: number; lockedUntil?: number }
    | null;
  return Boolean(
    result.committed &&
      state &&
      !state.lockedUntil &&
      (state.attempts ?? 0) <= maxAttempts,
  );
}

export async function clearLoginAttempts(database: Database, username: string) {
  await database.ref(loginAttemptPath(username)).remove();
}

function derivePinHash(pin: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(pin, salt, HASH_LENGTH, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
