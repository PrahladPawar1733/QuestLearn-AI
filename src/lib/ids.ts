import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const gen = customAlphabet(alphabet, 14);

export function newId(prefix: string): string {
  return `${prefix}_${gen()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
