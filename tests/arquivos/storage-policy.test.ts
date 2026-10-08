import { describe, expect, it } from "vitest";
import {
  assertVerifiedSchoolStorage,
  requiresVerifiedSchoolStorage,
} from "@/features/arquivos/storage-policy";

describe("confidential school file storage", () => {
  const document = {
    area: "secretaria",
    visibility: "private",
    relatedPersonId: "person-1",
  };

  it("requires server storage for private secretariat documents associated with people", () => {
    expect(requiresVerifiedSchoolStorage(document)).toBe(true);
    expect(requiresVerifiedSchoolStorage({ ...document, relatedPersonId: null })).toBe(false);
    expect(requiresVerifiedSchoolStorage({ ...document, area: "pessoal" })).toBe(false);
    expect(requiresVerifiedSchoolStorage({ ...document, visibility: "school" })).toBe(false);
  });

  it("rejects a local-only upload for a confidential document", () => {
    expect(() => assertVerifiedSchoolStorage(document, "local")).toThrow("armazenamento seguro");
  });

  it("rejects uploads that lack a persisted server record", () => {
    expect(() => assertVerifiedSchoolStorage(document, "sga", "local")).toThrow("base de dados");
  });

  it("accepts confirmed remote uploads and allows ordinary offline files", () => {
    expect(() => assertVerifiedSchoolStorage(document, "sga", "sga")).not.toThrow();
    expect(() =>
      assertVerifiedSchoolStorage({ ...document, area: "pessoal" }, "local", "local"),
    ).not.toThrow();
  });
});
