import { useMemo } from "react";
import { useAppContext } from "./use-app-context";
import { generateSuggestions } from "./suggestion-engine";
import { filterSuggestionsByPermission } from "./permission-resolver";
import { buildStudentSuggestionRules } from "./students/student-suggestion-rules";
import type { StudentRelationsSnapshot } from "./students/student-relations-adapter";
import { buildTeacherSuggestionRules } from "./teachers/teacher-suggestion-rules";
import type { TeacherRelationsSnapshot } from "./teachers/teacher-relations-adapter";
import { buildClassSuggestionRules } from "./classes/class-suggestion-rules";
import type { ClassRelationsSnapshot } from "./classes/class-relations-adapter";
import { buildFinanceOverviewSuggestionRules } from "./finance/finance-overview-suggestion-rules";
import { buildDashboardSuggestionRules } from "./dashboard/dashboard-suggestion-rules";
import type { DashboardOverviewSnapshot } from "./dashboard/dashboard-suggestion-rules";
import type { FinanceOverviewSnapshot } from "./finance/finance-overview-adapter";
import type { Suggestion } from "./types";

export function useSuggestions(): Suggestion[] {
  const context = useAppContext();

  return useMemo(() => {
    const entity = context.focusedEntity;
    if (!entity) return [];

    let raw: Suggestion[] = [];
    if (entity.type === "student") {
      const rules = buildStudentSuggestionRules(entity.id);
      raw = generateSuggestions(context, entity.data as StudentRelationsSnapshot, rules);
    } else if (entity.type === "teacher") {
      const rules = buildTeacherSuggestionRules(entity.id);
      raw = generateSuggestions(context, entity.data as TeacherRelationsSnapshot, rules);
    } else if (entity.type === "class") {
      const rules = buildClassSuggestionRules(entity.id);
      raw = generateSuggestions(context, entity.data as ClassRelationsSnapshot, rules);
    } else if (entity.type === "finance-overview") {
      const rules = buildFinanceOverviewSuggestionRules();
      raw = generateSuggestions(context, entity.data as FinanceOverviewSnapshot, rules);
    } else if (entity.type === "dashboard-overview") {
      const rules = buildDashboardSuggestionRules();
      raw = generateSuggestions(context, entity.data as DashboardOverviewSnapshot, rules);
    }

    return filterSuggestionsByPermission(raw, context.role, context.grants);
  }, [context]);
}
