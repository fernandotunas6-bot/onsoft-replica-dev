export type EnrollmentClassGroup = {
  id: string;
  name: string;
  grade_name: string;
  course_name: string;
  academic_year_id: string | null;
  academic_year_name?: string;
  course_id?: string | null;
  shift?: string;
  room_name?: string;
  capacity?: number | null;
  enrolled_count?: number;
  status?: string;
};

export type EnrollmentDirectoryFilters = {
  academicYearId?: string;
  courseId?: string;
  gradeName?: string;
  shift?: string;
  roomName?: string;
};

export type EnrollmentDirectoryOption = {
  id: string;
  label: string;
};

function uniqueOptions(
  rows: EnrollmentClassGroup[],
  getId: (row: EnrollmentClassGroup) => string,
  getLabel: (row: EnrollmentClassGroup) => string,
): EnrollmentDirectoryOption[] {
  const seen = new Set<string>();
  const result: EnrollmentDirectoryOption[] = [];
  for (const row of rows) {
    const id = getId(row).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, label: getLabel(row).trim() || id });
  }
  return result.sort((a, b) => a.label.localeCompare(b.label, "pt", { numeric: true }));
}

export function formatEnrollmentClassGroupLabel(group: EnrollmentClassGroup) {
  const occupancy =
    typeof group.capacity === "number" && group.capacity > 0
      ? `${group.enrolled_count ?? 0}/${group.capacity} alunos`
      : null;
  return [
    group.name,
    group.grade_name,
    group.course_name,
    group.shift || null,
    group.room_name && group.room_name !== "—" ? group.room_name : null,
    occupancy,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildEnrollmentDirectory(
  groups: EnrollmentClassGroup[],
  filters: EnrollmentDirectoryFilters,
) {
  const active = groups.filter(
    (group) =>
      group.status !== "closed" && group.status !== "archived" && group.status !== "inactive",
  );

  const academicYears = uniqueOptions(
    active,
    (group) => group.academic_year_id || "",
    (group) => group.academic_year_name || group.academic_year_id || "",
  );

  const yearRows = filters.academicYearId
    ? active.filter((group) => group.academic_year_id === filters.academicYearId)
    : active;

  const courses = uniqueOptions(
    yearRows,
    (group) => group.course_id || group.course_name,
    (group) => group.course_name,
  );

  const courseRows = filters.courseId
    ? yearRows.filter((group) => (group.course_id || group.course_name) === filters.courseId)
    : yearRows;

  const grades = uniqueOptions(
    courseRows,
    (group) => group.grade_name,
    (group) => group.grade_name,
  );

  const gradeRows = filters.gradeName
    ? courseRows.filter((group) => group.grade_name === filters.gradeName)
    : courseRows;

  const shifts = uniqueOptions(
    gradeRows.filter((group) => Boolean(group.shift)),
    (group) => group.shift || "",
    (group) => group.shift || "",
  );

  const shiftRows = filters.shift
    ? gradeRows.filter((group) => group.shift === filters.shift)
    : gradeRows;

  const rooms = uniqueOptions(
    shiftRows.filter((group) => Boolean(group.room_name) && group.room_name !== "—"),
    (group) => group.room_name || "",
    (group) => group.room_name || "",
  );

  const roomRows = filters.roomName
    ? shiftRows.filter((group) => group.room_name === filters.roomName)
    : shiftRows;

  return {
    academicYears,
    courses,
    grades,
    shifts,
    rooms,
    classGroups: roomRows,
  };
}

/**
 * Opções de turma para os formulários de colocação: o valor é o id. As listas
 * escolhiam a turma pelo texto «nome · classe», e duas turmas com o mesmo nome e
 * classe em cursos diferentes davam a primeira; a ficha juntava ao rótulo um
 * pedaço do id para as distinguir. Turmas sem ano lectivo não entram.
 */
export function classGroupChoices(
  groups: Array<{
    id: string;
    name: string;
    grade_name?: string | null;
    course_name?: string | null;
    academic_year_id?: string | null;
  }>,
) {
  return groups
    .filter((group) => group.academic_year_id)
    .map((group) => ({
      value: group.id,
      label: [group.name, group.grade_name, group.course_name]
        .filter((part) => part && part !== "—")
        .join(" · "),
    }));
}
