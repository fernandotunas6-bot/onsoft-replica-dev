import { describe, expect, it } from "vitest";
import {
  createPersonInputSchema,
  findPersonDuplicatesInputSchema,
  mergePeopleInputSchema,
  personCoreFieldsSchema,
  personDocumentInputSchema,
  searchPeopleInputSchema,
  setPersonInstitutionRolesInputSchema,
  setPersonPhotoUrlInputSchema,
  updatePersonInputSchema,
} from "@/features/people/schemas";

describe("personCoreFieldsSchema", () => {
  it("rejects a name shorter than 2 characters", () => {
    const result = personCoreFieldsSchema.safeParse({ full_name: "A" });
    expect(result.success).toBe(false);
  });

  it("accepts a minimal valid person with only a full name", () => {
    const result = personCoreFieldsSchema.safeParse({ full_name: "Ana Domingos" });
    expect(result.success).toBe(true);
  });

  it("treats blank optional strings as undefined instead of empty strings", () => {
    const result = personCoreFieldsSchema.parse({ full_name: "Ana Domingos", phone_primary: "" });
    expect(result.phone_primary).toBeUndefined();
  });

  it("rejects an invalid email but accepts an empty one", () => {
    expect(
      personCoreFieldsSchema.safeParse({ full_name: "Ana Domingos", email: "not-an-email" })
        .success,
    ).toBe(false);
    expect(personCoreFieldsSchema.parse({ full_name: "Ana Domingos", email: "" }).email).toBe(
      undefined,
    );
  });

  it("rejects an unknown sex value", () => {
    const result = personCoreFieldsSchema.safeParse({ full_name: "Ana Domingos", sex: "X" });
    expect(result.success).toBe(false);
  });

  it("valida NIF/BI quando fornecido", () => {
    expect(
      personCoreFieldsSchema.safeParse({ full_name: "Ana Domingos", nif: "INVALID" }).success,
    ).toBe(false);
    const parsed = personCoreFieldsSchema.parse({
      full_name: "Ana Domingos",
      nif: "000204688CA010",
    });
    expect(parsed.nif).toBe("000204688CA010");
  });
});

describe("createPersonInputSchema", () => {
  it("defaults roles/documents/relationships to empty arrays", () => {
    const result = createPersonInputSchema.parse({ person: { full_name: "Ana Domingos" } });
    expect(result.roles).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.relationships).toEqual([]);
  });

  it("rejects a role outside the allowed set", () => {
    const result = createPersonInputSchema.safeParse({
      person: { full_name: "Ana Domingos" },
      roles: ["director-geral"],
    });
    expect(result.success).toBe(false);
  });

  it("requires a document number when a document is provided", () => {
    const result = createPersonInputSchema.safeParse({
      person: { full_name: "Ana Domingos" },
      documents: [{ document_type: "bi", document_number: "" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("searchPeopleInputSchema", () => {
  it("defaults to an empty query and a limit of 20", () => {
    const result = searchPeopleInputSchema.parse({});
    expect(result.query).toBe("");
    expect(result.limit).toBe(20);
  });

  it("rejects a limit above 50", () => {
    expect(searchPeopleInputSchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it("accepts territorial filters", () => {
    const result = searchPeopleInputSchema.parse({
      province: "Huambo",
      municipality: "Caála",
      commune: "Cuima",
      role: "encarregado",
    });
    expect(result.province).toBe("Huambo");
    expect(result.municipality).toBe("Caála");
    expect(result.commune).toBe("Cuima");
    expect(result.role).toBe("encarregado");
  });
});

describe("findPersonDuplicatesInputSchema", () => {
  it("requires at least a full name", () => {
    expect(findPersonDuplicatesInputSchema.safeParse({}).success).toBe(false);
    expect(findPersonDuplicatesInputSchema.safeParse({ fullName: "Ana Domingos" }).success).toBe(
      true,
    );
  });
});

describe("mergePeopleInputSchema", () => {
  it("requires a reason with at least 3 characters", () => {
    const survivorId = "11111111-1111-1111-1111-111111111111";
    const duplicateId = "22222222-2222-2222-2222-222222222222";
    expect(
      mergePeopleInputSchema.safeParse({ survivorId, duplicateId, reason: "ok" }).success,
    ).toBe(false);
    expect(
      mergePeopleInputSchema.safeParse({ survivorId, duplicateId, reason: "mesmo BI" }).success,
    ).toBe(true);
  });

  it("rejects non-UUID ids", () => {
    expect(
      mergePeopleInputSchema.safeParse({
        survivorId: "not-a-uuid",
        duplicateId: "22222222-2222-2222-2222-222222222222",
        reason: "mesmo BI",
      }).success,
    ).toBe(false);
  });
});

describe("updatePersonInputSchema", () => {
  it("exige id e nome", () => {
    expect(updatePersonInputSchema.safeParse({ fullName: "Ana" }).success).toBe(false);
    const parsed = updatePersonInputSchema.parse({
      personId: "11111111-1111-1111-1111-111111111111",
      fullName: "Ana Domingos",
      email: "ana@escola.ao",
    });
    expect(parsed.fullName).toBe("Ana Domingos");
  });

  it("valida NIF/BI quando fornecido", () => {
    expect(
      updatePersonInputSchema.safeParse({
        personId: "11111111-1111-1111-1111-111111111111",
        fullName: "Ana Domingos",
        nif: "INVALID",
      }).success,
    ).toBe(false);
    const parsed = updatePersonInputSchema.parse({
      personId: "11111111-1111-1111-1111-111111111111",
      fullName: "Ana Domingos",
      nif: "000204688CA010",
    });
    expect(parsed.nif).toBe("000204688CA010");
  });

  it("aceita localização territorial na actualização", () => {
    const parsed = updatePersonInputSchema.parse({
      personId: "11111111-1111-1111-1111-111111111111",
      fullName: "Ana Domingos",
      province: "Huambo",
      municipality: "Huambo",
      commune: "Calima",
      address: "Bairro Académico",
    });
    expect(parsed.province).toBe("Huambo");
    expect(parsed.address).toBe("Bairro Académico");
  });

  it("aceita referência a ficheiro da biblioteca no documento", () => {
    const parsed = personDocumentInputSchema.parse({
      document_type: "outro",
      document_number: "SCAN-1",
      file_id: "11111111-1111-4111-8111-111111111111",
      file_name: "bi-scan.pdf",
    });
    expect(parsed.file_name).toBe("bi-scan.pdf");
  });
});

describe("setPersonInstitutionRolesInputSchema", () => {
  it("accepts multiple institutional roles without student or teacher pseudo-links", () => {
    const parsed = setPersonInstitutionRolesInputSchema.parse({
      personId: "11111111-1111-1111-1111-111111111111",
      roles: ["encarregado", "coordenador", "contacto_institucional"],
    });
    expect(parsed.roles).toEqual(["encarregado", "coordenador", "contacto_institucional"]);
  });

  it("rejects aluno/professor because those roles come from domain records", () => {
    expect(
      setPersonInstitutionRolesInputSchema.safeParse({
        personId: "11111111-1111-1111-1111-111111111111",
        roles: ["aluno"],
      }).success,
    ).toBe(false);
    expect(
      setPersonInstitutionRolesInputSchema.safeParse({
        personId: "11111111-1111-1111-1111-111111111111",
        roles: ["professor"],
      }).success,
    ).toBe(false);
  });
});

describe("setPersonPhotoUrlInputSchema", () => {
  it("accepts only public HTTPS URLs or a private SIGA file reference", () => {
    const personId = "11111111-1111-1111-1111-111111111111";
    const fileId = "22222222-2222-4222-8222-222222222222";
    expect(
      setPersonPhotoUrlInputSchema.safeParse({
        personId,
        photoUrl: `siga-file://${fileId}`,
      }).success,
    ).toBe(true);
    expect(
      setPersonPhotoUrlInputSchema.safeParse({
        personId,
        photoUrl: "siga-file://not-a-file",
      }).success,
    ).toBe(false);
  });
});
