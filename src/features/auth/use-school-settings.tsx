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
import { getSchoolSettings, listAcademicTerms, listAcademicYears } from "@/features/school/server";
import type { PedagogySettings } from "@/features/school/schemas";
import {
  schoolSettingDefaults,
  schoolYear as fallbackSchoolYear,
  type AngolaSchoolTypeId,
} from "@/lib/school-config";
import { todayInLuanda } from "@/features/calendar/dates";

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
  // Espelha o schema em vez de repetir as uniões à mão, que já divergiam do que
  // o painel de definições consegue produzir.
  pedagogy?: PedagogySettings;
  version: number;
  institution?: {
    school_type: AngolaSchoolTypeId | null;
    philosophy: string | null;
  };
  branding?: {
    logo_url: string | null;
    motto: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    portal_title?: string | null;
  };
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

export type AcademicTermOption = {
  id: string;
  name: string;
  sequence: number;
  starts_on: string;
  ends_on: string;
  academic_year_id: string;
  label: string;
};

const YEAR_ID_KEY = "siga:selected-year-id";
const TERM_ID_KEY = "siga:selected-term-id";

function formatSchoolYearLabel(academicYear: string | null | undefined) {
  const raw = academicYear?.trim() || schoolSettingDefaults.academicYear;
  return raw.toLowerCase().startsWith("ano") ? raw : `Ano Lectivo ${raw}`;
}

function formatTermLabel(term: { name: string; sequence: number }) {
  const name = term.name?.trim();
  if (name) return name;
  if (term.sequence > 0) return `${term.sequence}.º Período`;
  return "Período";
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
  terms: AcademicTermOption[];
  selectedTerm: AcademicTermOption | null;
  selectedTermId: string | null;
  selectedTermLabel: string;
  setSelectedTermId: (termId: string) => void;
};

const SchoolYearContext = createContext<SchoolYearContextValue | null>(null);

export function SchoolYearProvider({ children }: { children: ReactNode }) {
  const [selectedYearId, setSelectedYearIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(YEAR_ID_KEY);
  });
  const [selectedTermId, setSelectedTermIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TERM_ID_KEY);
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
        institution: data.institution,
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

  const termsQuery = useQuery({
    queryKey: ["school", "academic-terms"],
    queryFn: () => listAcademicTerms(),
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

  const terms = useMemo<AcademicTermOption[]>(() => {
    const yearId = selectedYear?.id;
    const rows = (termsQuery.data ?? []).filter((term) =>
      yearId ? term.academic_year_id === yearId : true,
    );
    return rows.map((term) => ({
      ...term,
      label: formatTermLabel(term),
    }));
  }, [termsQuery.data, selectedYear?.id]);

  const currentTerm = useMemo(() => {
    const today = todayInLuanda();
    return (
      terms.find((term) => term.starts_on <= today && term.ends_on >= today) ?? terms[0] ?? null
    );
  }, [terms]);

  useEffect(() => {
    if (!terms.length) {
      if (selectedTermId) {
        setSelectedTermIdState(null);
        localStorage.removeItem(TERM_ID_KEY);
      }
      return;
    }
    if (selectedTermId && terms.some((term) => term.id === selectedTermId)) return;
    if (currentTerm?.id) {
      setSelectedTermIdState(currentTerm.id);
      localStorage.setItem(TERM_ID_KEY, currentTerm.id);
    }
  }, [terms, selectedTermId, currentTerm?.id]);

  const setSelectedTermId = useCallback((termId: string) => {
    setSelectedTermIdState(termId);
    localStorage.setItem(TERM_ID_KEY, termId);
  }, []);

  const selectedTerm = terms.find((term) => term.id === selectedTermId) ?? currentTerm ?? null;
  const selectedTermLabel = selectedTerm?.label ?? "Período";

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
      terms,
      selectedTerm,
      selectedTermId: selectedTerm?.id ?? null,
      selectedTermLabel,
      setSelectedTermId,
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
      terms,
      selectedTerm,
      selectedTermLabel,
      setSelectedTermId,
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
      terms: [] as AcademicTermOption[],
      selectedTerm: null,
      selectedTermId: null,
      selectedTermLabel: "Período",
      setSelectedTermId: (_termId: string) => {
        /* sem provider */
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
