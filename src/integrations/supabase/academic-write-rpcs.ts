import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./types";

/** Contrato da migração academic_write_integrity ainda por aplicar.
 * Não alterar tipos gerados da produção; remover a extensão após recaptura.
 */
type AcademicWriteFunctions = {
  siga_reorganize_enrollment_guarded: {
    Args: {
      p_school_id: string;
      p_actor_user_id: string;
      p_enrollment_id: string;
      p_source_class_id: string;
      p_target_class_id: string;
    };
    Returns: undefined;
  };
  siga_write_assessment_scores_atomic: {
    Args: { p_school_id: string; p_actor_user_id: string; p_item_id: string; p_rows: Json };
    Returns: number;
  };
  siga_return_task_submission_atomic: {
    Args: {
      p_school_id: string;
      p_actor_user_id: string;
      p_task_id: string;
      p_submission_id: string;
      p_grade: number | null;
      p_feedback: string | null;
    };
    Returns: Json;
  };
};
type AcademicWriteDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Omit<Database["public"]["Functions"], keyof AcademicWriteFunctions> &
      AcademicWriteFunctions;
  };
};
export function academicWriteRpcClient(client: SupabaseClient) {
  return client as unknown as SupabaseClient<AcademicWriteDatabase>;
}
