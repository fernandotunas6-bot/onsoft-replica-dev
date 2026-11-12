import { createMiddleware } from "@tanstack/react-start";
import { REQUEST_ID_HEADER, newRequestId, tagErrorWithRequestId } from "@/lib/request-id";

/** Middleware global (`src/start.ts`): um ID por chamada, ligado ao erro se falhar. */
export const correlateServerFn = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const requestId = newRequestId();
  try {
    return await next({ headers: { [REQUEST_ID_HEADER]: requestId } });
  } catch (error) {
    tagErrorWithRequestId(error, requestId);
    throw error;
  }
});
