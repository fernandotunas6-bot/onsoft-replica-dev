import { z } from "zod";
export const schoolAccessRequestInputSchema=z.object({
 schoolId:z.string().uuid(),
 fullName:z.string().trim().min(3).max(160),
 nationalId:z.string().trim().max(30).optional(),
 institutionalId:z.string().trim().max(40).optional(),
 requestedRole:z.enum(["student","teacher","guardian","user"]),
}).refine(x=>Boolean(x.nationalId||x.institutionalId),{
 message:"Indique o B.I. ou identificador institucional.",
});
export const schoolAccessReviewInputSchema=z.object({
 requestId:z.string().uuid(),
 decision:z.enum(["under_review","needs_information","rejected","approved"]),
 note:z.string().trim().max(1000).optional(),
 personId:z.string().uuid().nullable().optional(),
});
