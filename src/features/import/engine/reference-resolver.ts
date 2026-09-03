import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeText, foldForCompare } from "./normalize";

export interface ResolvedPerson {
  id: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  isNew: boolean;
}

export interface ResolvedClassGroup {
  id: string;
  name: string;
  code: string | null;
  grade_level_id: string | null;
}

export interface ResolvedSubject {
  id: string;
  name: string;
  code: string | null;
}

export interface ResolvedStudent {
  id: string;
  person_id: string;
  student_number: string;
  full_name: string;
  isNew: boolean;
}

/**
 * Motor de resolução de referências relacionais em grafo.
 * Traduz chaves humanas (nomes, BI, códigos, números de processo)
 * em UUIDs relacionais do SGA sem forçar o utilizador a manipulá-los.
 */
export class ReferenceResolver {
  constructor(
    private db: SupabaseClient,
    private schoolId: string,
    private academicYearId: string | null,
  ) {}

  /**
   * Localiza uma pessoa pelo documento nacional (BI) ou pelo nome normalizado + telefone/nascimento.
   * Se não existir e autoCreate for true, cria uma nova pessoa em `public.people`.
   */
  async resolveOrCreatePerson(
    personData: {
      full_name: string;
      national_id?: string | null;
      gender?: string | null;
      birth_date?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
    },
    autoCreate = false,
  ): Promise<ResolvedPerson | null> {
    const cleanName = normalizeText(personData.full_name);
    if (!cleanName) return null;

    const cleanBi = personData.national_id ? normalizeText(personData.national_id).toUpperCase() : null;

    // 1. Procurar por BI/documento na escola
    if (cleanBi) {
      const { data: byDoc } = await this.db
        .from("people")
        .select("id, full_name, national_id, phone, email")
        .eq("school_id", this.schoolId)
        .eq("national_id", cleanBi)
        .is("deleted_at", null)
        .maybeSingle();

      if (byDoc) {
        return {
          id: byDoc.id,
          full_name: byDoc.full_name,
          national_id: byDoc.national_id,
          phone: byDoc.phone,
          email: byDoc.email,
          isNew: false,
        };
      }
    }

    // 2. Procurar por correspondência exata de nome
    const { data: byNameList } = await this.db
      .from("people")
      .select("id, full_name, national_id, phone, email")
      .eq("school_id", this.schoolId)
      .is("deleted_at", null);

    const foldedTarget = foldForCompare(cleanName);
    const existing = (byNameList || []).find(
      (p) => foldForCompare(p.full_name) === foldedTarget,
    );

    if (existing) {
      return {
        id: existing.id,
        full_name: existing.full_name,
        national_id: existing.national_id,
        phone: existing.phone,
        email: existing.email,
        isNew: false,
      };
    }

    if (!autoCreate) return null;

    // 3. Criar nova pessoa
    const { data: inserted, error } = await this.db
      .from("people")
      .insert({
        school_id: this.schoolId,
        full_name: cleanName,
        national_id: cleanBi,
        gender: personData.gender || null,
        date_of_birth: personData.birth_date || null,
        phone: personData.phone || null,
        email: personData.email || null,
        address: personData.address || null,
        status: "active",
      })
      .select("id, full_name, national_id, phone, email")
      .single();

    if (error || !inserted) {
      throw new Error(`Falha ao registrar pessoa "${cleanName}": ${error?.message || "Erro desconhecido"}`);
    }

    return {
      id: inserted.id,
      full_name: inserted.full_name,
      national_id: inserted.national_id,
      phone: inserted.phone,
      email: inserted.email,
      isNew: true,
    };
  }

  /**
   * Localiza uma turma na escola e ano lectivo ativo a partir de seu nome ou código.
   */
  async resolveClassGroup(classNameOrCode: string): Promise<ResolvedClassGroup | null> {
    const clean = normalizeText(classNameOrCode);
    if (!clean) return null;

    let query = this.db
      .from("class_groups")
      .select("id, name, code, grade_level_id")
      .eq("school_id", this.schoolId)
      .is("deleted_at", null);

    if (this.academicYearId) {
      query = query.eq("academic_year_id", this.academicYearId);
    }

    const { data: classes } = await query;
    if (!classes || classes.length === 0) return null;

    const folded = foldForCompare(clean);
    const found = classes.find(
      (c) =>
        foldForCompare(c.name) === folded ||
        (c.code && foldForCompare(c.code) === folded),
    );

    if (!found) return null;

    return {
      id: found.id,
      name: found.name,
      code: found.code,
      grade_level_id: found.grade_level_id,
    };
  }

  /**
   * Localiza uma disciplina na escola a partir de sua sigla, código ou nome.
   */
  async resolveSubject(subjectNameOrCode: string): Promise<ResolvedSubject | null> {
    const clean = normalizeText(subjectNameOrCode);
    if (!clean) return null;

    const { data: subjects } = await this.db
      .from("subjects")
      .select("id, name, code")
      .eq("school_id", this.schoolId)
      .is("deleted_at", null);

    if (!subjects || subjects.length === 0) return null;

    const folded = foldForCompare(clean);
    const found = subjects.find(
      (s) =>
        foldForCompare(s.name) === folded ||
        (s.code && foldForCompare(s.code) === folded),
    );

    if (!found) return null;

    return {
      id: found.id,
      name: found.name,
      code: found.code,
    };
  }

  /**
   * Localiza um aluno na escola pelo número de processo ou documento.
   */
  async resolveStudent(identifier: string): Promise<ResolvedStudent | null> {
    const clean = normalizeText(identifier);
    if (!clean) return null;

    // Tentar primeiro por student_number
    const { data: byNum } = await this.db
      .from("students")
      .select("id, person_id, student_number, people!inner(full_name)")
      .eq("school_id", this.schoolId)
      .eq("student_number", clean)
      .is("deleted_at", null)
      .maybeSingle();

    if (byNum) {
      const person = Array.isArray(byNum.people) ? byNum.people[0] : byNum.people;
      return {
        id: byNum.id,
        person_id: byNum.person_id,
        student_number: byNum.student_number,
        full_name: person?.full_name || "",
        isNew: false,
      };
    }

    // Tentar por BI da pessoa associada
    const { data: byBi } = await this.db
      .from("students")
      .select("id, person_id, student_number, people!inner(full_name, national_id)")
      .eq("school_id", this.schoolId)
      .eq("people.national_id", clean.toUpperCase())
      .is("deleted_at", null)
      .maybeSingle();

    if (byBi) {
      const person = Array.isArray(byBi.people) ? byBi.people[0] : byBi.people;
      return {
        id: byBi.id,
        person_id: byBi.person_id,
        student_number: byBi.student_number,
        full_name: person?.full_name || "",
        isNew: false,
      };
    }

    return null;
  }
}
