import "server-only";

import { createHash, randomInt } from "crypto";
import bcrypt from "bcryptjs";

export function generateOtpCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(randomInt(min, max + 1));
}

export async function hashOtp(code: string) {
  return bcrypt.hash(code, 10);
}

export async function verifyOtp(code: string, hash: string | null | undefined) {
  if (!hash) {
    return false;
  }

  return bcrypt.compare(code, hash);
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
