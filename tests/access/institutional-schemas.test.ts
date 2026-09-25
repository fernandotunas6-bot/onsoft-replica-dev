import { describe,expect,it } from "vitest";
import { schoolAccessRequestInputSchema,schoolAccessReviewInputSchema } from "@/features/access/institutional-schemas";
const schoolId="11111111-1111-4111-8111-111111111111";
const requestId="22222222-2222-4222-8222-222222222222";
describe("Institutional onboarding access contracts",()=>{
 it("accepts existing institutional student number without requiring a B.I.",()=>{
  expect(schoolAccessRequestInputSchema.safeParse({schoolId,fullName:"Aluno Exemplo",institutionalId:"ST123",requestedRole:"student"}).success).toBe(true);
 });
 it("defer institutional identifiers until the school authorizes full registration",()=>{
  expect(schoolAccessRequestInputSchema.safeParse({schoolId,fullName:"Aluno Exemplo",requestedRole:"student"}).success).toBe(true);
  expect(schoolAccessRequestInputSchema.safeParse({schoolId,fullName:" ",nationalId:"ABC",requestedRole:"student"}).success).toBe(false);
 });
 it("does not allow a user to request elevated secretary or administrator role",()=>{
  expect(schoolAccessRequestInputSchema.safeParse({schoolId,fullName:"Pessoa Exemplo",nationalId:"BI001",requestedRole:"admin"}).success).toBe(false);
  expect(schoolAccessRequestInputSchema.safeParse({schoolId,fullName:"Pessoa Exemplo",nationalId:"BI001",requestedRole:"secretary"}).success).toBe(false);
 });
 it("only accepts documented review decisions and UUIDs",()=>{
  expect(schoolAccessReviewInputSchema.safeParse({requestId,decision:"approved",personId:schoolId}).success).toBe(true);
  expect(schoolAccessReviewInputSchema.safeParse({requestId,decision:"owner"}).success).toBe(false);
  expect(schoolAccessReviewInputSchema.safeParse({requestId:"any",decision:"approved"}).success).toBe(false);
 });
});
