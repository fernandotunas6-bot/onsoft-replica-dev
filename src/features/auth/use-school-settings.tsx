import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { getSchoolSettings, listAcademicYears } from "@/features/school/server";
import { schoolSettingDefaults, schoolYear as fallbackSchoolYear } from "@/lib/school-config";

export type SchoolSettingsRow = {
  id: string;
  name: string;
  nif: string | null;
  director_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  academic_year: string | null;
  currency: string;
  evaluation_periods: number;
  passing_grade: number;
  preferences: unknown;
  pedagogy?: {
    teachingLevels: Array<
      "pre_escolar" | "primario" | "i_ciclo" | "ii_ciclo" | "tecnico" | "adultos" | "superior"
    >;
    courses: Array<"cfb" | "cej" | "letras" | "tecnico">;
    closedTerms?: Array<1 | 2 | 3>;
    gradingProfile?: {
      scale: "20_ects" | "gpa4";
      components: "frequencia_exame" | "so_exame";
    } | null;
  };
  version: number;
  branding?: { logo_url: string | null };
  banking?: {
    bank_name: string;
    account_holder: string;
    iban: string;
    swift: string;
    multicaixa_merchant: string;
  };
  agt?: {
    software_certified: string;
    invoice_series: string;
    fiscal_notes: string;
  };
};

export type AcademicYearOption = {
  id: string;
  code: string;
  name: string;
  status: string;
  label: string;
};

const YEAR_ID_KEY = "siga:selected-year-id";

function formatSchoolYearLabel(academicYear: string | null | undefined) {
  const raw = academicYear?.trim() || schoolSettingDefaults.academicYear;
  return raw.toLowerCase().startsWith("ano") ? raw : `Ano Lectivo ${raw}`;
}

type SchoolYearContextValue = {
  school: SchoolSettingsRow | null;
  isLoading: boolean;
  academicYears: AcademicYearOption[];
  activeYear: AcademicYearOption | null;
  selectedYear: AcademicYearOption | null;
  selectedYearId: string | null;
  selectedYearLabel: string;
  yearOptions: AcademicYearOption[];
  setSelectedYearId: (yearId: string) => void;
};

const SchoolYearContext = createContext<SchoolYearContextValue | null>(null);

export function SchoolYearProvider({ children }: { children: ReactNode }) {
  const [selectedYearId, setSelectedYearIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(YEAR_ID_KEY);
  });

  const schoolQuery = useQuery({
    queryKey: ["school", "settings"],
    queryFn: async () => {
      const data = await getSchoolSettings();
      const row: SchoolSettingsRow = {
        id: data.id,
        name: data.name,
        nif: data.nif,
        director_name: data.director_name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        academic_year: data.academic_year,
        currency: data.currency,
        evaluation_periods: data.evaluation_periods,
        passing_grade: data.passing_grade,
        preferences: data.preferences,
        pedagogy: data.pedagogy,
        version: data.version,
        branding: data.branding,
        banking: data.banking,
        agt: data.agt,
      };
      return row;
    },
    staleTime: 5 * 60_000,
  });

  const academicYearsQuery = useQuery({
    queryKey: ["school", "academic-years"],
    queryFn: () => listAcademicYears(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const academicYears = useMemo<AcademicYearOption[]>(
    () =>
      (academicYearsQuery.data ?? []).map((year) => ({
        ...year,
        label: formatSchoolYearLabel(year.name || year.code),
      })),
    [academicYearsQuery.data],
  );

  const activeYear = useMemo(() => {
    const byStatus = academicYears.find((year) => year.status === "active") ?? null;
    if (byStatus) return byStatus;
    const schoolYearName = schoolQuery.data?.academic_year?.trim();
    if (schoolYearName) {
      const byName = academicYears.find(
        (year) =>
          year.name === schoolYearName ||
          year.code === schoolYearName ||
          year.label === formatSchoolYearLabel(schoolYearName),
      );
      if (byName) return byName;
    }
    return academicYears[0] ?? null;
  }, [academicYears, schoolQuery.data?.academic_year]);

  useEffect(() => {
    if (!academicYears.length) return;
    if (selectedYearId && academicYears.some((year) => year.id === selectedYearId)) return;
    if (activeYear?.id) {
      setSelectedYearIdState(activeYear.id);
      localStorage.setItem(YEAR_ID_KEY, activeYear.id);
    }
  }, [academicYears, selectedYearId, activeYear?.id]);

  const setSelectedYearId = useCallback((yearId: string) => {
    setSelectedYearIdState(yearId);
    localStorage.setItem(YEAR_ID_KEY, yearId);
  }, []);

  const selectedYear =
    academicYears.find((year) => year.id === selectedYearId) ?? activeYear ?? null;

  const selectedYearLabel =
    selectedYear?.label ??
    formatSchoolYearLabel(schoolQuery.data?.academic_year) ??
    fallbackSchoolYear;

  const value = useMemo<SchoolYearContextValue>(
    () => ({
      school: schoolQuery.data ?? null,
      isLoading: schoolQuery.isLoading || academicYearsQuery.isLoading,
      academicYears,
      activeYear,
      selectedYear,
      selectedYearId: selectedYear?.id ?? null,
      selectedYearLabel,
      yearOptions: academicYears.length
        ? academicYears
        : [
            {
              id: "fallback",
              code: schoolSettingDefaults.academicYear,
              name: fallbackSchoolYear,
              status: "active",
              label: selectedYearLabel,
            },
          ],
      setSelectedYearId,
    }),
    [
      schoolQuery.data,
      schoolQuery.isLoading,
      academicYearsQuery.isLoading,
      academicYears,
      activeYear,
      selectedYear,
      selectedYearLabel,
      setSelectedYearId,
    ],
  );

  return <SchoolYearContext.Provider value={value}>{children}</SchoolYearContext.Provider>;
}

export function useSchoolSettings() {
  const context = useContext(SchoolYearContext);
  if (!context) {
    return {
      school: null,
      isLoading: true,
      academicYears: [] as AcademicYearOption[],
      activeYear: null,
      selectedYear: null,
      selectedYearId: null,
      selectedYearLabel: fallbackSchoolYear,
      yearOptions: [] as AcademicYearOption[],
      setSelectedYearId: (_yearId: string) => {
        /* sem provider: a selecção só existe na área autenticada */
      },
      activeYearLabel: fallbackSchoolYear,
      data: null,
    };
  }
  return {
    ...context,
    activeYearLabel: context.selectedYearLabel,
    data: context.school,
    isLoading: context.isLoading,
  };
}
