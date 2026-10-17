import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "./errors";

/** Map "not found / forbidden" AppErrors to the Next.js 404 page in server components. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AppError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
}
