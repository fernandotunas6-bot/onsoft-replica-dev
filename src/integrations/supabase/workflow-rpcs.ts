import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./types";
import { z } from "zod";

/**
 * Os dois RPCs estão aplicados na produção desde 2026-10-10 e `types.ts` já os
 * descreve. O que fica aqui é só a nulidade dos argumentos: o gerador do CLI
 * não a conhece (um parâmetro sem valor por omissão sai como obrigatório e
 * não-nulo), e estas funções aceitam NULL de propósito — ano por nome em vez de
 * id, matrícula sem turma, data de admissão em branco. Daí o `Omit`: substitui
 * a entrada gerada em vez de a intersectar, que é como `string & (string|null)`
 * voltava a ser `string` e recusava o `null` dos chamadores.
 * Não editar types.ts à mão — é gerado da produção.
 */
type WorkflowFunctions = {
  siga_enroll_new_student_atomic: {
    Args: {
      p_school_id: string;
      p_request_id: string;
      p_person: Json;
      p_guardians: Json;
      p_class_group_id: string | null;
      p_academic_year_id: string | null;
      p_admission_date: string | null;
    };
    Returns: Json;
  };
  siga_save_active_academic_year: {
    Args: {
      p_school_id: string;
      p_year_id: string | null;
      p_name: string | null;
      p_starts_on: string | null;
      p_ends_on: string | null;
    };
    Returns: Json;
  };
};
type WorkflowDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Omit<Database["public"]["Functions"], keyof WorkflowFunctions> & WorkflowFunctions;
  };
};
export function workflowRpcClient(client: SupabaseClient) {
  return client as unknown as SupabaseClient<WorkflowDatabase>;
}

export const atomicStudentResultSchema = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  student_number: z.string().min(1),
  status: z.enum(["applicant", "active"]),
  enrollment_number: z.string().nullable(),
});
export const activeYearResultSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  created: z.boolean(),
});

export function assertWorkflowRpcAvailable(error: { code?: string; message?: string } | null) {
  if (error?.code === "PGRST202" || error?.code === "42883") {
    throw new Error(
      "Esta operação está temporariamente indisponível. Contacte a administração para actualizar o serviço. Nenhum registo foi criado por este pedido.",
    );
  }
}
