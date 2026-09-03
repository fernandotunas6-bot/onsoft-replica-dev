import { createFileRoute } from "@tanstack/react-router";
import {
  handlePayflowRequest,
  withPayflowCors,
} from "@/features/payflow/server";

// style-check: route-exempt — external PayFlow HTTP API.

async function run(request: Request, splat: string | undefined) {
  const response = await handlePayflowRequest(request, splat);
  return withPayflowCors(request, response);
}

export const Route = createFileRoute("/api/payflow/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => run(request, params._splat),
      POST: async ({ request, params }) => run(request, params._splat),
      OPTIONS: async ({ request, params }) => run(request, params._splat),
    },
  },
  component: PayflowApiPlaceholder,
});

function PayflowApiPlaceholder() {
  return null;
}
