import { z } from "zod";
import { nullableHttpUrlSchema } from "@/lib/safe-url";

export const alumniEmploymentStatuses = [
  "employed",
  "self_employed",
  "student",
  "seeking",
  "unavailable",
  "unknown",
] as const;
export const alumniVisibilityLevels = ["private", "school", "alumni"] as const;
export const alumniExperienceKinds = [
  "education",
  "employment",
  "business",
  "volunteering",
  "award",
  "certification",
] as const;
export const alumniOpportunityTypes = [
  "job",
  "internship",
  "scholarship",
  "mentoring",
  "business",
  "volunteer",
  "event",
  "other",
] as const;
export const alumniOpportunityStatuses = ["draft", "published", "closed", "archived"] as const;
export const alumniEngagementKinds = [
  "event",
  "mentoring",
  "career",
  "volunteer",
  "donation",
  "survey",
  "communication",
  "other",
] as const;

const nullableUrl = nullableHttpUrlSchema;
const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();

export const listAlumniInputSchema = z.object({
  query: z.string().trim().max(120).optional().default(""),
  graduationYear: z.number().int().min(1950).max(2100).optional(),
  employmentStatus: z.enum(alumniEmploymentStatuses).optional(),
  mentoringOnly: z.boolean().optional().default(false),
  opportunitiesOnly: z.boolean().optional().default(false),
  verifiedOnly: z.boolean().optional().default(false),
  province: z.string().trim().max(120).optional(),
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(200).optional().default(50),
});

export const alumniIdInputSchema = z.object({ alumniId: z.string().uuid() });
export const studentIdInputSchema = z.object({ studentId: z.string().uuid() });

export const upsertAlumniInputSchema = z.object({
  studentId: z.string().uuid(),
  graduationYear: z.number().int().min(1950).max(2100).nullable().optional(),
  graduationGrade: nullableText(180),
  graduationCourse: nullableText(180),
  headline: nullableText(180),
  biography: nullableText(3000),
  currentCompany: nullableText(180),
  currentRole: nullableText(180),
  employmentStatus: z.enum(alumniEmploymentStatuses).optional(),
  industry: nullableText(120),
  city: nullableText(120),
  province: nullableText(120),
  country: nullableText(120),
  linkedinUrl: nullableUrl,
  websiteUrl: nullableUrl,
  skills: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  interests: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  availableForMentoring: z.boolean().optional(),
  seekingMentor: z.boolean().optional(),
  openToOpportunities: z.boolean().optional(),
  directoryVisibility: z.enum(alumniVisibilityLevels).optional(),
  contactConsent: z.boolean().optional(),
});

export const alumniExperienceInputSchema = z.object({
  alumniId: z.string().uuid(),
  experienceId: z.string().uuid().optional(),
  kind: z.enum(alumniExperienceKinds),
  organization: z.string().trim().min(1).max(180),
  title: nullableText(180),
  field: nullableText(180),
  location: nullableText(180),
  startedOn: z.string().date().nullable().optional(),
  endedOn: z.string().date().nullable().optional(),
  isCurrent: z.boolean().optional().default(false),
  description: nullableText(2000),
});

export const deleteAlumniExperienceInputSchema = z.object({
  alumniId: z.string().uuid(),
  experienceId: z.string().uuid(),
});

export const listAlumniOpportunitiesInputSchema = z.object({
  status: z.enum(alumniOpportunityStatuses).optional(),
  type: z.enum(alumniOpportunityTypes).optional(),
  query: z.string().trim().max(120).optional().default(""),
  limit: z.number().int().min(1).max(200).optional().default(100),
});

export const upsertAlumniOpportunityInputSchema = z.object({
  opportunityId: z.string().uuid().optional(),
  createdByAlumniId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(180),
  organization: nullableText(180),
  opportunityType: z.enum(alumniOpportunityTypes).default("job"),
  description: nullableText(5000),
  location: nullableText(180),
  remoteAllowed: z.boolean().optional().default(false),
  applicationUrl: nullableUrl,
  startsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  status: z.enum(alumniOpportunityStatuses).default("draft"),
});

export const alumniOpportunityApplicationInputSchema = z.object({
  opportunityId: z.string().uuid(),
  alumniId: z.string().uuid(),
  status: z
    .enum(["interested", "applied", "shortlisted", "accepted", "rejected", "withdrawn"])
    .default("interested"),
  notes: nullableText(2000),
});

export const mentoringMatchInputSchema = z
  .object({
    mentorAlumniId: z.string().uuid(),
    menteeAlumniId: z.string().uuid(),
    focusArea: z.string().trim().min(2).max(180),
    notes: nullableText(2000),
  })
  .refine((value) => value.mentorAlumniId !== value.menteeAlumniId, {
    message: "Mentor e mentorado devem ser pessoas diferentes.",
    path: ["menteeAlumniId"],
  });

export const mentoringStatusInputSchema = z.object({
  mentorshipId: z.string().uuid(),
  status: z.enum(["requested", "active", "completed", "cancelled"]),
});

export const alumniEngagementInputSchema = z.object({
  alumniId: z.string().uuid(),
  kind: z.enum(alumniEngagementKinds),
  title: z.string().trim().min(2).max(180),
  occurredAt: z.string().datetime().optional(),
  valueNumeric: z.number().finite().nullable().optional(),
  notes: nullableText(2000),
});

export const alumniEventInputSchema = z.object({
  eventId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(180),
  description: nullableText(5000),
  eventType: z
    .enum([
      "reunion",
      "career",
      "mentoring",
      "networking",
      "webinar",
      "volunteer",
      "fundraising",
      "other",
    ])
    .default("networking"),
  location: nullableText(180),
  onlineUrl: nullableUrl,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  status: z.enum(["draft", "published", "completed", "cancelled"]).default("draft"),
});

export const alumniEventRegistrationInputSchema = z.object({
  eventId: z.string().uuid(),
  alumniId: z.string().uuid(),
  status: z.enum(["registered", "attended", "cancelled", "waitlist"]).default("registered"),
});

export const alumniSurveyInputSchema = z.object({
  surveyId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(180),
  description: nullableText(3000),
  purpose: z
    .enum(["tracer_study", "employment", "satisfaction", "skills", "impact", "other"])
    .default("tracer_study"),
  schemaJson: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        label: z.string().min(1).max(240),
        type: z.enum(["text", "textarea", "number", "select", "multiselect", "boolean", "date"]),
        required: z.boolean().optional(),
        options: z.array(z.string().max(180)).optional(),
      }),
    )
    .max(100)
    .default([]),
  status: z.enum(["draft", "published", "closed", "archived"]).default("draft"),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
});

export const alumniSurveyResponseInputSchema = z.object({
  surveyId: z.string().uuid(),
  alumniId: z.string().uuid(),
  responseJson: z.record(z.string(), z.unknown()),
});

export const alumniContributionInputSchema = z
  .object({
    alumniId: z.string().uuid(),
    contributionType: z.enum([
      "donation",
      "sponsorship",
      "scholarship",
      "in_kind",
      "volunteer_hours",
      "other",
    ]),
    amount: z.number().nonnegative().nullable().optional(),
    currency: z.string().trim().min(3).max(8).default("AOA"),
    hours: z.number().nonnegative().nullable().optional(),
    designation: nullableText(180),
    occurredAt: z.string().datetime().optional(),
    reference: nullableText(180),
    notes: nullableText(2000),
  })
  .refine(
    (value) => value.amount != null || value.hours != null || value.contributionType === "other",
    { message: "Informe um valor ou horas de contribuição." },
  );
