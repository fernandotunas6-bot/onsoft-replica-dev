import { useMemo } from "react";
import { canReadModule, type ModuleGrantMap } from "@/features/auth/access-policy";
import { applyRelationMap } from "./relation-engine";
import { buildStudentRelationMap } from "./students/student-relation-map";
import type { StudentRelationsSnapshot } from "./students/student-relations-adapter";
import { buildTeacherRelationMap } from "./teachers/teacher-relation-map";
import type { TeacherRelationsSnapshot } from "./teachers/teacher-relations-adapter";
import { buildClassRelationMap } from "./classes/class-relation-map";
import type { ClassRelationsSnapshot } from "./classes/class-relations-adapter";
import { buildFinanceOverviewRelationMap } from "./finance/finance-overview-relation-map";
import type { FinanceOverviewSnapshot } from "./finance/finance-overview-adapter";
import { buildDashboardOverviewRelationMap } from "./dashboard/dashboard-overview-relation-map";
import type { DashboardOverviewSnapshot } from "./dashboard/dashboard-suggestion-rules";
import { useAppContext } from "./use-app-context";
import type { RelationEdge } from "./types";

export function useRelations(): RelationEdge[] {
  const context = useAppContext();

  return useMemo(() => {
    const entity = context.focusedEntity;
    if (!entity) return [];

    let edges: RelationEdge[] = [];
    if (entity.type === "student") {
      const map = buildStudentRelationMap(entity.id);
      edges = applyRelationMap(map, entity.data as StudentRelationsSnapshot);
    } else if (entity.type === "teacher") {
      const map = buildTeacherRelationMap(entity.id);
      edges = applyRelationMap(map, entity.data as TeacherRelationsSnapshot);
    } else if (entity.type === "class") {
      const map = buildClassRelationMap(entity.id);
      edges = applyRelationMap(map, entity.data as ClassRelationsSnapshot);
    } else if (entity.type === "finance-overview") {
      const map = buildFinanceOverviewRelationMap();
      edges = applyRelationMap(map, entity.data as FinanceOverviewSnapshot);
    } else if (entity.type === "dashboard-overview") {
      const map = buildDashboardOverviewRelationMap();
      edges = applyRelationMap(map, entity.data as DashboardOverviewSnapshot);
    }

    return edges.filter((edge) =>
      canReadModule(context.role, edge.module as keyof ModuleGrantMap, context.grants),
    );
  }, [context]);
}
