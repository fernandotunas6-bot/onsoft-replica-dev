import { createFileRoute } from "@tanstack/react-router";
import { getPublicEnrollmentForm, submitPublicEnrollment } from "@/features/enrollment/server";
import { submitPublicEnrollmentInputSchema } from "@/features/enrollment/schemas";
import { clientIpFromRequest } from "@/lib/request-ip";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import { createSchoolWebsiteHandler } from "@/features/school-website/http";

// style-check: route-exempt — API pública dos websites escolares; sem interface nova.
const handle = createSchoolWebsiteHandler({
  getForm: (slug) => getPublicEnrollmentForm({ data: { slug } }),
  parseApplication: (body) => submitPublicEnrollmentInputSchema.parse(body),
  submit: (body) => submitPublicEnrollment({ data: submitPublicEnrollmentInputSchema.parse(body) }),
  origins: () => process.env.SIGA_SCHOOL_WEBSITE_ORIGINS,
  consumeSubmission: async (request) => {
    const ip = clientIpFromRequest(request);
    if (ip === "unknown") throw new Error("Request origin unavailable");
    return consumeRateLimit([`public_school_website:${ip}`], {
      windowMs: 60 * 60 * 1000,
      max: 10,
    });
  },
});

export const Route = createFileRoute("/api/public/school-website/$slug")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.slug),
      POST: ({ request, params }) => handle(request, params.slug),
      OPTIONS: ({ request, params }) => handle(request, params.slug),
    },
  },
});
