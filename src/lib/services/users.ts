import "server-only";
import { db } from "../db";
import { nowIso } from "../ids";
import type { User } from "../types";

export async function getOrCreateUser(uid: string): Promise<User> {
  const existing = await db().get<User>("users", uid);
  if (existing) return existing;
  const user: User = {
    id: uid,
    displayName: "Explorer",
    isGuest: true,
    totalXP: 0,
    currentStreakDays: 0,
    questionsAnswered: 0,
    achievements: [],
    worldsPlayed: [],
    createdAt: nowIso(),
  };
  await db().create("users", user);
  return (await db().get<User>("users", uid)) ?? user;
}

export async function updateUser(uid: string, fn: (u: User) => User): Promise<User> {
  return db().withLock(`user:${uid}`, async () => {
    const u = await getOrCreateUser(uid);
    const next = fn(u);
    await db().set("users", next);
    return next;
  });
}
