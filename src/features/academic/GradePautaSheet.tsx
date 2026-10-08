import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileBadge, FileDown, Lock, Save, Unlock } from "lucide-react";
import { toast } from "sonner";
import { whatsappHref } from "@/features/integrations/actions";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveEntityView } from "@/components/mobile/ResponsiveEntityView";
import { badgeBase, toneClass } from "@/components/layout/PageHeader";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { sendOrQueue } from "@/lib/offline/outbox";
import { currentUserId } from "@/lib/offline/outbox-session";
import { overlayPauta, overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { setTermLock } from "@/features/school/server";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { exportOfficialPautaPdf, exportPdfTable } from "@/lib/export-pdf-loader";
import {
  angolaGradeScale,
  annualAverage,
  formatScore,
  getPeriodsForCycle,
  getPeriodNoun,
  inferTeachingCycle,
  initialsFromName,
  scoreAverage,
  situacaoPauta,
  subjectShortCode,
} from "@/lib/angola-academic";
import { cn } from "@/lib/utils";

type EnrollmentRow = {
  id: string;
  student_name: string;
  student_photo_url?: string | null;
  registration_number?: string | null;
  class_group_id?: string | null;
  class_group_name: string;
};

type TermGradeRow = {
  enrollment_id: string;
  subject_id: string;
  term: number;
  mac: number;
  npp: number;
  npt: number;
};

type ClassGroupOption = {
  id: string;
  name: string;
  course_name?: string;
  grade_name?: string;
};

type SubjectOption = {
  id: string;
  name: string;
  code?: string | null;
};

type Draft = { mac: string; npp: string; npt: string };
type PautaView = "disciplina" | "geral" | "anual";

function parseScore(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 20) return null;
  return parsed;
}

function termAverage(
  grades: TermGradeRow[],
  enrollmentId: string,
  subjectId: string,
  term: number,
) {
  const grade = grades.find(
    (row) =>
      row.enrollment_id === enrollmentId && row.subject_id === subjectId && row.term === term,
  );
  return grade ? scoreAverage(grade.mac, grade.npp, grade.npt) : null;
}

/**
 * `Enter` salta para o mesmo campo do aluno seguinte — lançar uma pauta é
 * percorrer uma coluna, não uma linha.
 *
 * Procura nos dois marcadores porque a mesma pauta tem duas vistas: a tabela do
 * computador (`data-pauta`) e os cartões do telemóvel (`data-pauta-mobile`). Só
 * uma delas está montada de cada vez, por isso não há ambiguidade — mas fixar
 * apenas a do computador deixava o salto morto no telemóvel, que é precisamente
 * onde ele poupa mais toques.
 */
function focusNextCell(index: number, field: keyof Draft) {
  const next =
    document.querySelector<HTMLInputElement>(`[data-pauta="${index + 1}-${field}"]`) ??
    document.querySelector<HTMLInputElement>(`[data-pauta-mobile="${index + 1}-${field}"]`);
  next?.focus();
  next?.select();
}

export function GradePautaSheet({
  schoolName,
  academicYear,
  classGroups,
  subjects,
  enrollments,
  termGrades,
  passingGrade = angolaGradeScale.passing,
  canLaunch,
  canLockTerm = false,
  closedTerms = [],
  evaluationPeriods,
}: {
  schoolName: string;
  academicYear: string;
  classGroups: ClassGroupOption[];
  subjects: SubjectOption[];
  enrollments: EnrollmentRow[];
  termGrades: TermGradeRow[];
  passingGrade?: number;
  canLaunch: boolean;
  canLockTerm?: boolean;
  closedTerms?: Array<1 | 2 | 3>;
  evaluationPeriods?: number | undefined;
}) {
  const queryClient = useQueryClient();
  const { selectedTerm: globalTerm, terms: academicTerms, setSelectedTermId } = useSchoolSettings();
  const installed = useInstalledIntegrations();
  const turnitinOn = installed.hasCapability("turnitin.originality");
  const moodleGrades = installed.hasCapability("moodle.grades");
  const canvasWork = installed.hasCapability("canvas.assignments");
  const classroomWork = installed.hasCapability("classroom.work");
  const resendDocuments = installed.hasCapability("resend.documents");
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const [view, setView] = useState<PautaView>("disciplina");
  const [classGroupId, setClassGroupId] = useState(classGroups[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const initialTerm =
    globalTerm?.sequence && globalTerm.sequence >= 1 && globalTerm.sequence <= 3
      ? (globalTerm.sequence as 1 | 2 | 3)
      : 1;
  const [term, setTerm] = useState<1 | 2 | 3>(initialTerm);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    if (!classGroupId && classGroups[0]?.id) setClassGroupId(classGroups[0].id);
  }, [classGroupId, classGroups]);

  useEffect(() => {
    if (!subjectId && subjects[0]?.id) setSubjectId(subjects[0].id);
  }, [subjectId, subjects]);

  const selectedGroup = classGroups.find((group) => group.id === classGroupId);
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const selectedCycle = inferTeachingCycle(selectedGroup?.grade_name, selectedGroup?.course_name);
  const periodOptions = getPeriodsForCycle(selectedCycle, evaluationPeriods);
  const periodNoun = getPeriodNoun(selectedCycle);

  useEffect(() => {
    if (!periodOptions.includes(term)) setTerm(periodOptions[0] ?? 1);
  }, [periodOptions, term]);

  useEffect(() => {
    const sequence = globalTerm?.sequence;
    if (!sequence || !periodOptions.includes(sequence as 1 | 2 | 3)) return;
    if (sequence !== term) setTerm(sequence as 1 | 2 | 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao período global
  }, [globalTerm?.id, globalTerm?.sequence, periodOptions]);

  const applyTermSelection = (next: 1 | 2 | 3) => {
    setTerm(next);
    const match = academicTerms.find((item) => item.sequence === next);
    if (match) setSelectedTermId(match.id);
  };

  const termClosed = closedTerms.includes(term);
  const canEdit = canLaunch && !termClosed;

  const roster = useMemo(
    () =>
      enrollments
        .filter((row) => row.class_group_id === classGroupId)
        .slice()
        .sort((a, b) => a.student_name.localeCompare(b.student_name, "pt")),
    [classGroupId, enrollments],
  );

  const geralSubjects = useMemo(() => {
    const activeIds = new Set(
      termGrades
        .filter(
          (grade) =>
            grade.term === term && roster.some((student) => student.id === grade.enrollment_id),
        )
        .map((grade) => grade.subject_id),
    );
    return [...subjects]
      .sort((left, right) => {
        const leftRank = activeIds.has(left.id) ? 0 : 1;
        const rightRank = activeIds.has(right.id) ? 0 : 1;
        return leftRank - rightRank || left.name.localeCompare(right.name, "pt");
      })
      .slice(0, 14);
  }, [roster, subjects, term, termGrades]);

  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const student of roster) {
      const existing = termGrades.find(
        (grade) =>
          grade.enrollment_id === student.id &&
          grade.subject_id === subjectId &&
          grade.term === term,
      );
      next[student.id] = {
        mac: existing ? String(existing.mac) : "",
        npp: existing ? String(existing.npp) : "",
        npt: existing ? String(existing.npt) : "",
      };
    }
    setDrafts(next);
  }, [roster, subjectId, term, termGrades]);

  const updateDraft = (enrollmentId: string, field: keyof Draft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [enrollmentId]: {
        ...(current[enrollmentId] ?? { mac: "", npp: "", npt: "" }),
        [field]: value,
      },
    }));
  };

  const pendingRows = roster.flatMap((student) => {
    const draft = drafts[student.id];
    if (!draft) return [];
    const mac = parseScore(draft.mac);
    const npp = parseScore(draft.npp);
    const npt = parseScore(draft.npt);
    if (mac == null || npp == null || npt == null) return [];
    const existing = termGrades.find(
      (grade) =>
        grade.enrollment_id === student.id && grade.subject_id === subjectId && grade.term === term,
    );
    if (existing && existing.mac === mac && existing.npp === npp && existing.npt === npt) {
      return [];
    }
    return [{ enrollmentId: student.id, mac, npp, npt }];
  });

  // Linhas começadas mas que não se podem gravar (falta MAC/NPP/NPT ou valor
  // fora de 0–20). Antes eram ignoradas sem aviso e o professor julgava-as
  // guardadas.
  const unsavedDrafts = roster.filter((student) => {
    const draft = drafts[student.id];
    if (!draft) return false;
    const values = [draft.mac, draft.npp, draft.npt];
    if (values.every((value) => value.trim() === "")) return false;
    return values.some((value) => parseScore(value) == null);
  }).length;

  const savePauta = async () => {
    if (!subjectId || pendingRows.length === 0 || termClosed) return;
    setSaving(true);
    try {
      // Sem rede, na app desktop, as notas ficam guardadas no posto e seguem quando a
      // rede volta (lib/offline/outbox). No navegador, grava como antes.
      const outcome = await sendOrQueue(
        "grades.term",
        { subjectId, term, rows: pendingRows },
        {
          label: [
            "Notas",
            selectedGroup?.name,
            selectedSubject?.name,
            `${term}º ${periodNoun.toLowerCase()}`,
          ]
            .filter(Boolean)
            .join(" · "),
          userId: await currentUserId(),
        },
      );
      if (outcome.queued) {
        toast.info(`Notas guardadas neste computador · ${pendingRows.length} aluno(s)`, {
          description: "Sem ligação ao servidor. São enviadas sozinhas quando a Internet voltar.",
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] });
      toast.success(`Pauta guardada · ${pendingRows.length} aluno(s)`);
      if (unsavedDrafts > 0) {
        toast.warning(
          `${unsavedDrafts} aluno(s) não foram guardados: falta MAC, NPP ou NPT, ou a nota está fora de 0–20.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar a pauta.");
    } finally {
      setSaving(false);
    }
  };

  const toggleTermLock = async () => {
    setLocking(true);
    try {
      await setTermLock({ data: { term, closed: !termClosed } });
      await queryClient.invalidateQueries({ queryKey: ["school", "settings"] });
      toast.success(
        termClosed
          ? `${term}º ${periodNoun.toLowerCase()} reaberto.`
          : `${term}º ${periodNoun.toLowerCase()} fechado.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o fecho.");
    } finally {
      setLocking(false);
    }
  };

  const exportCurrentPauta = () => {
    const turma = selectedGroup?.name ?? "turma";
    if (view === "disciplina") {
      exportPdfTable(
        `pauta-${turma}-${selectedSubject?.name ?? "disciplina"}-t${term}`,
        "Pauta de avaliação contínua",
        [
          { label: "Nº", value: (row) => row.n },
          { label: "Aluno", value: (row) => row.aluno },
          { label: "Proc.", value: (row) => row.proc },
          { label: "MAC", value: (row) => row.mac },
          { label: "NPP", value: (row) => row.npp },
          { label: "NPT", value: (row) => row.npt },
          { label: "Média", value: (row) => row.media },
          { label: "Situação", value: (row) => row.situacao },
        ],
        roster.map((student, index) => {
          const draft = drafts[student.id] ?? { mac: "", npp: "", npt: "" };
          const mac = parseScore(draft.mac);
          const npp = parseScore(draft.npp);
          const npt = parseScore(draft.npt);
          const average =
            mac != null && npp != null && npt != null ? scoreAverage(mac, npp, npt) : null;
          return {
            n: index + 1,
            aluno: student.student_name,
            proc: student.registration_number ?? "",
            mac: formatScore(mac, 0),
            npp: formatScore(npp, 0),
            npt: formatScore(npt, 0),
            media: formatScore(average),
            situacao: average == null ? "Pendente" : situacaoPauta(average, passingGrade).label,
          };
        }),
        `${schoolName} · ${academicYear} · ${turma} · ${selectedSubject?.name ?? ""} · ${term}º ${periodNoun.toLowerCase()}`,
      );
      return;
    }

    if (view === "geral") {
      exportPdfTable(
        `pauta-geral-${turma}-t${term}`,
        "Pauta geral da turma",
        [
          { label: "Nº", value: (row) => row.n },
          { label: "Aluno", value: (row) => row.aluno },
          ...geralSubjects.map((subject) => ({
            label: subjectShortCode(subject.name, subject.code),
            value: (row: Record<string, string | number>) => row[subject.id],
          })),
          { label: "MG", value: (row) => row.mg },
          { label: "Situação", value: (row) => row.situacao },
        ],
        roster.map((student, index) => {
          const averages = geralSubjects.map((subject) =>
            termAverage(termGrades, student.id, subject.id, term),
          );
          const mediaGeral = annualAverage(averages);
          return {
            n: index + 1,
            aluno: student.student_name,
            ...Object.fromEntries(
              geralSubjects.map((subject, subjectIndex) => [
                subject.id,
                formatScore(averages[subjectIndex]),
              ]),
            ),
            mg: formatScore(mediaGeral),
            situacao:
              mediaGeral == null ? "Pendente" : situacaoPauta(mediaGeral, passingGrade).label,
          };
        }),
        `${schoolName} · ${academicYear} · ${turma} · ${term}º ${periodNoun.toLowerCase()}`,
      );
      return;
    }

    exportPdfTable(
      `pauta-anual-${turma}`,
      "Pauta anual",
      [
        { label: "Nº", value: (row) => row.n },
        { label: "Aluno", value: (row) => row.aluno },
        { label: "1º T", value: (row) => row.t1 },
        { label: "2º T", value: (row) => row.t2 },
        { label: "3º T", value: (row) => row.t3 },
        { label: "MFA", value: (row) => row.mfa },
        { label: "Situação", value: (row) => row.situacao },
      ],
      roster.map((student, index) => {
        const terms = ([1, 2, 3] as const).map((item) => {
          const averages = subjects.map((subject) =>
            termAverage(termGrades, student.id, subject.id, item),
          );
          return annualAverage(averages);
        });
        const mfa = annualAverage(terms);
        return {
          n: index + 1,
          aluno: student.student_name,
          t1: formatScore(terms[0]),
          t2: formatScore(terms[1]),
          t3: formatScore(terms[2]),
          mfa: formatScore(mfa),
          situacao: mfa == null ? "Pendente" : situacaoPauta(mfa, passingGrade).label,
        };
      }),
      `${schoolName} · ${academicYear} · ${turma} · média final anual`,
    );
  };

  const exportOficialPauta = () => {
    const turma = selectedGroup?.name ?? "turma";
    const printSchool = { name: schoolName, academicYear };
    const officialMeta = {
      schoolName,
      academicYear,
      issuedOn: new Date().toLocaleDateString("pt-AO"),
      validationCode: documentValidationCode([
        schoolName,
        turma,
        view,
        String(term),
        String(roster.length),
      ]),
    };

    if (view === "disciplina") {
      const rows = roster.map((student, index) => {
        const draft = drafts[student.id] ?? { mac: "", npp: "", npt: "" };
        const mac = parseScore(draft.mac);
        const npp = parseScore(draft.npp);
        const npt = parseScore(draft.npt);
        const average =
          mac != null && npp != null && npt != null ? scoreAverage(mac, npp, npt) : null;
        return {
          n: index + 1,
          aluno: student.student_name,
          proc: student.registration_number ?? "",
          mac: formatScore(mac, 0),
          npp: formatScore(npp, 0),
          npt: formatScore(npt, 0),
          media: formatScore(average),
          situacao: average == null ? "Pendente" : situacaoPauta(average, passingGrade).label,
        };
      });
      const columns = [
        { label: "Nº", value: (row: (typeof rows)[number]) => row.n },
        { label: "Aluno", value: (row: (typeof rows)[number]) => row.aluno },
        { label: "Proc.", value: (row: (typeof rows)[number]) => row.proc },
        { label: "MAC", value: (row: (typeof rows)[number]) => row.mac },
        { label: "NPP", value: (row: (typeof rows)[number]) => row.npp },
        { label: "NPT", value: (row: (typeof rows)[number]) => row.npt },
        { label: "Média", value: (row: (typeof rows)[number]) => row.media },
        { label: "Situação", value: (row: (typeof rows)[number]) => row.situacao },
      ];
      void issuePrintDocument({
        tipo: "Pauta disciplinar",
        school: printSchool,
        overlay: overlayPauta({
          ...(selectedSubject?.name ? { subjectName: selectedSubject.name } : {}),
          periodName: `${term}º ${periodNoun.toLowerCase()}`,
          className: turma,
          ...((selectedGroup?.course_name ?? selectedGroup?.grade_name)
            ? { courseName: selectedGroup?.course_name ?? selectedGroup?.grade_name }
            : {}),
          students: rows.map((row) => ({
            fullName: row.aluno,
            academicNumber: row.proc,
            mac: row.mac,
            npp: row.npp,
            npt: row.npt,
            average: row.media,
            status: row.situacao,
          })),
        }),
        fallback: () =>
          exportOfficialPautaPdf(
            `pauta-${turma}-${selectedSubject?.name ?? "disciplina"}-t${term}`,
            "Pauta de avaliação contínua",
            officialMeta,
            columns,
            rows,
          ),
      });
      return;
    }

    if (view === "geral") {
      const rows = roster.map((student, index) => {
        const averages = geralSubjects.map((subject) =>
          termAverage(termGrades, student.id, subject.id, term),
        );
        const mediaGeral = annualAverage(averages);
        return {
          n: index + 1,
          aluno: student.student_name,
          ...Object.fromEntries(
            geralSubjects.map((subject, subjectIndex) => [
              subject.id,
              formatScore(averages[subjectIndex]),
            ]),
          ),
          mg: formatScore(mediaGeral),
          situacao: mediaGeral == null ? "Pendente" : situacaoPauta(mediaGeral, passingGrade).label,
        };
      });
      const columns = [
        { label: "Nº", value: (row: (typeof rows)[number]) => row.n },
        { label: "Aluno", value: (row: (typeof rows)[number]) => row.aluno },
        ...geralSubjects.map((subject) => ({
          label: subjectShortCode(subject.name, subject.code),
          value: (row: Record<string, string | number>) => row[subject.id],
        })),
        { label: "MG", value: (row: (typeof rows)[number]) => row.mg },
        { label: "Situação", value: (row: (typeof rows)[number]) => row.situacao },
      ];
      void issuePrintDocument({
        tipo: "Pauta geral da turma",
        school: printSchool,
        overlay: overlayPauta({
          periodName: `${term}º ${periodNoun.toLowerCase()}`,
          className: turma,
          ...((selectedGroup?.course_name ?? selectedGroup?.grade_name)
            ? { courseName: selectedGroup?.course_name ?? selectedGroup?.grade_name }
            : {}),
          subjects: geralSubjects.map((subject) => ({
            name: subject.name,
            shortName: subjectShortCode(subject.name, subject.code),
            ...(subject.code ? { code: subject.code } : {}),
          })),
          students: roster.map((student) => {
            const averages = geralSubjects.map((subject) =>
              termAverage(termGrades, student.id, subject.id, term),
            );
            const mediaGeral = annualAverage(averages);
            return {
              fullName: student.student_name,
              academicNumber: student.registration_number ?? "",
              subjectGrades: averages.map((value) => formatScore(value)),
              average: formatScore(mediaGeral),
              status:
                mediaGeral == null ? "Pendente" : situacaoPauta(mediaGeral, passingGrade).label,
            };
          }),
        }),
        fallback: () =>
          exportOfficialPautaPdf(
            `pauta-geral-${turma}-t${term}`,
            "Pauta geral da turma",
            officialMeta,
            columns,
            rows,
          ),
      });
      return;
    }

    const rows = roster.map((student, index) => {
      const terms = ([1, 2, 3] as const).map((item) => {
        const averages = subjects.map((subject) =>
          termAverage(termGrades, student.id, subject.id, item),
        );
        return annualAverage(averages);
      });
      const mfa = annualAverage(terms);
      return {
        n: index + 1,
        aluno: student.student_name,
        proc: student.registration_number ?? "",
        t1: formatScore(terms[0]),
        t2: formatScore(terms[1]),
        t3: formatScore(terms[2]),
        mfa: formatScore(mfa),
        situacao: mfa == null ? "Pendente" : situacaoPauta(mfa, passingGrade).label,
      };
    });
    const columns = [
      { label: "Nº", value: (row: (typeof rows)[number]) => row.n },
      { label: "Aluno", value: (row: (typeof rows)[number]) => row.aluno },
      { label: "1º T", value: (row: (typeof rows)[number]) => row.t1 },
      { label: "2º T", value: (row: (typeof rows)[number]) => row.t2 },
      { label: "3º T", value: (row: (typeof rows)[number]) => row.t3 },
      { label: "MFA", value: (row: (typeof rows)[number]) => row.mfa },
      { label: "Situação", value: (row: (typeof rows)[number]) => row.situacao },
    ];
    void issuePrintDocument({
      tipo: "Pauta anual (lista)",
      school: printSchool,
      overlay: overlayServico({
        name: "Pauta anual",
        areaLabel: "Pedagógica",
        reference: `PAN-${rows.length}`,
        status: "Oficial",
        parties: [
          { label: "Turma", value: turma },
          { label: "Escola", value: schoolName },
        ],
        sections: [
          {
            title: "Médias finais",
            rows: rows.map((row) => ({
              label: row.aluno,
              value: String(row.mfa),
              note: `${row.t1} · ${row.t2} · ${row.t3} · ${row.situacao}`,
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(`pauta-anual-${turma}`, "Pauta anual", officialMeta, columns, rows),
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
        <p className="text-[11px] font-bold text-muted-foreground">
          República de Angola · Ministério da Educação
        </p>
        <h3 className="mt-1 font-display text-lg font-extrabold tracking-tight">{schoolName}</h3>
        <p className="text-sm text-muted-foreground">
          {view === "anual"
            ? `Pauta anual · ${academicYear}`
            : view === "geral"
              ? `Pauta geral da turma · ${academicYear} · ${term}º ${periodNoun.toLowerCase()}`
              : `Pauta de avaliação contínua · ${academicYear} · ${term}º ${periodNoun.toLowerCase()}`}
        </p>
        <p className="mt-1 text-sm font-semibold">
          {selectedGroup?.grade_name ?? "Classe"} · {selectedGroup?.name ?? "Turma"} ·{" "}
          {selectedGroup?.course_name ?? "Curso"}
          {view === "disciplina" ? ` · ${selectedSubject?.name ?? "Disciplina"}` : null}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Escala 0–20 · (MAC + NPT) / 2 · NPP exibida sem entrar na média · Transita com média ≥{" "}
          {passingGrade}
          {termClosed ? ` · ${periodNoun} fechado` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-border p-0.5">
          {(
            [
              ["disciplina", "Lançar"],
              ["geral", "Pauta geral"],
              ["anual", "Anual"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold",
                view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground">
          Turma
          <select
            aria-label="Turma"
            className="flex h-9 min-w-[180px] rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            value={classGroupId}
            onChange={(event) => setClassGroupId(event.target.value)}
          >
            {classGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.grade_name ? `${group.grade_name} · ` : ""}
                {group.name}
              </option>
            ))}
          </select>
        </label>
        {view === "disciplina" ? (
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Disciplina
            <select
              aria-label="Disciplina"
              className="flex h-9 min-w-[180px] rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            >
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {view !== "anual" ? (
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            {periodNoun}
            <select
              aria-label={periodNoun}
              className="flex h-9 min-w-[100px] rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              value={term}
              onChange={(event) => applyTermSelection(Number(event.target.value) as 1 | 2 | 3)}
            >
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {p}º
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCurrentPauta}>
          <FileDown className="size-3.5" /> PDF
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={exportOficialPauta}>
          <FileBadge className="size-3.5" /> Oficial
        </Button>
        {whatsappOn ? (
          <Button size="sm" variant="outline" asChild>
            <a
              href={whatsappHref(
                "",
                `Pauta ${selectedGroup?.name ?? "turma"} · ${view === "disciplina" ? (selectedSubject?.name ?? "disciplina") : view} · ${academicYear}`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </Button>
        ) : null}
        {resendDocuments ? (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(
                `Pauta ${selectedGroup?.name ?? "turma"} · ${view === "disciplina" ? (selectedSubject?.name ?? "disciplina") : view} · ${academicYear}\n${schoolName}`,
              );
              toast.success("Pauta copiada para e-mail Resend");
            }}
          >
            E-mail
          </Button>
        ) : null}
        {turnitinOn ? (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const payload = [
                schoolName,
                academicYear,
                selectedGroup?.name ?? "turma",
                view === "disciplina" ? (selectedSubject?.name ?? "disciplina") : view,
                view === "anual" ? "anual" : `T${term}`,
                `${roster.length} alunos`,
              ].join(" · ");
              await navigator.clipboard.writeText(payload);
              toast.success("Lote Turnitin copiado", {
                description: "Cole no Turnitin ou abra o guia oficial.",
              });
              window.open("https://developers.turnitin.com/", "_blank", "noopener,noreferrer");
            }}
          >
            Turnitin
          </Button>
        ) : null}
        {classroomWork ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open("https://classroom.google.com/", "_blank", "noopener,noreferrer")
            }
          >
            Trabalhos
          </Button>
        ) : null}
        {moodleGrades ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open("https://docs.moodle.org/en/Gradebook", "_blank", "noopener,noreferrer")
            }
          >
            Notas Moodle
          </Button>
        ) : null}
        {canvasWork ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(
                "https://canvas.instructure.com/doc/api/assignments.html",
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            Canvas
          </Button>
        ) : null}
        {canLockTerm && view !== "anual" ? (
          <Button
            size="sm"
            variant={termClosed ? "outline" : "secondary"}
            className="gap-1.5"
            disabled={locking}
            onClick={() => void toggleTermLock()}
          >
            {termClosed ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
            {termClosed
              ? `Reabrir ${periodNoun.toLowerCase()}`
              : `Fechar ${periodNoun.toLowerCase()}`}
          </Button>
        ) : null}
        {canEdit && view === "disciplina" ? (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={saving || pendingRows.length === 0}
            onClick={() => void savePauta()}
          >
            <Save className="size-3.5" />
            {saving ? "A guardar…" : `Guardar pauta (${pendingRows.length})`}
          </Button>
        ) : null}
        {canEdit && view === "disciplina" && unsavedDrafts > 0 ? (
          <p className="text-xs text-warning-strong" role="status">
            {unsavedDrafts} aluno(s) por completar: faltam notas ou há valores fora de 0–20.
          </p>
        ) : null}
      </div>

      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta turma ainda não tem matrículas activas.
        </p>
      ) : view === "geral" ? (
        <ResponsiveEntityView
          mobile={
            /*
             * §38: a pauta geral é uma matriz aluno × disciplina. A 360px
             * nenhuma matriz se lê. Aqui a matriz é transposta por aluno: um
             * cartão por aluno com as suas disciplinas, a média e a situação —
             * a mesma informação, na ordem em que um director a lê no telemóvel
             * ("como está este aluno?" e não "como está esta célula?").
             */
            <ul className="space-y-2.5">
              {roster.map((student) => {
                const averages = geralSubjects.map((subject) =>
                  termAverage(termGrades, student.id, subject.id, term),
                );
                const mediaGeral = annualAverage(averages);
                const situacao =
                  mediaGeral == null
                    ? { label: "Pendente", tone: "muted" as const }
                    : situacaoPauta(mediaGeral, passingGrade);
                return (
                  <li key={student.id} className="rounded-xl border border-border bg-card p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">{student.student_name}</p>
                      <span className="tnum shrink-0 text-lg leading-none">
                        {formatScore(mediaGeral)}
                      </span>
                    </div>
                    <dl className="mt-2.5 space-y-1 border-t border-border pt-2.5">
                      {geralSubjects.map((subject, subjectIndex) => (
                        <div key={subject.id} className="flex items-baseline justify-between gap-3">
                          <dt className="min-w-0 truncate text-xs text-muted-foreground">
                            {subject.name}
                          </dt>
                          <dd className="tnum shrink-0 text-xs">
                            {formatScore(averages[subjectIndex])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <span
                      className={cn(
                        badgeBase,
                        "mt-2.5",
                        situacao.tone === "success"
                          ? toneClass.success
                          : situacao.tone === "danger"
                            ? toneClass.danger
                            : toneClass.muted,
                      )}
                    >
                      {situacao.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          }
          desktop={
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Nº</TableHead>
                    <TableHead>Aluno</TableHead>
                    {geralSubjects.map((subject) => (
                      <TableHead key={subject.id} className="text-right" title={subject.name}>
                        {subjectShortCode(subject.name, subject.code)}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">MG</TableHead>
                    <TableHead className="text-right">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((student, index) => {
                    const averages = geralSubjects.map((subject) =>
                      termAverage(termGrades, student.id, subject.id, term),
                    );
                    const mediaGeral = annualAverage(averages);
                    const situacao =
                      mediaGeral == null
                        ? { label: "Pendente", tone: "muted" as const }
                        : situacaoPauta(mediaGeral, passingGrade);
                    return (
                      <TableRow key={student.id}>
                        <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <UserAvatar
                              {...(student.student_photo_url
                                ? { url: student.student_photo_url }
                                : {})}
                              initials={initialsFromName(student.student_name)}
                              className="size-9 bg-primary-soft text-[11px] font-extrabold text-primary"
                            />
                            <span className="font-semibold">{student.student_name}</span>
                          </div>
                        </TableCell>
                        {averages.map((average, subjectIndex) => (
                          <TableCell key={geralSubjects[subjectIndex]?.id} className="text-right">
                            {formatScore(average)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-bold">
                          {formatScore(mediaGeral)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              badgeBase,
                              situacao.tone === "success"
                                ? toneClass.success
                                : situacao.tone === "danger"
                                  ? toneClass.danger
                                  : toneClass.muted,
                            )}
                          >
                            {situacao.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          }
        />
      ) : view === "anual" ? (
        <ResponsiveEntityView
          mobile={
            /* Anual: três períodos e a MFA cabem num cartão sem transpor nada. */
            <ul className="space-y-2.5">
              {roster.map((student) => {
                const termValues = ([1, 2, 3] as const).map((item) =>
                  annualAverage(
                    subjects.map((subject) =>
                      termAverage(termGrades, student.id, subject.id, item),
                    ),
                  ),
                );
                const mfa = annualAverage(termValues);
                const situacao =
                  mfa == null
                    ? { label: "Pendente", tone: "muted" as const }
                    : situacaoPauta(mfa, passingGrade);
                return (
                  <li key={student.id} className="rounded-xl border border-border bg-card p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">{student.student_name}</p>
                      <span
                        className={cn(
                          badgeBase,
                          "shrink-0",
                          situacao.tone === "success"
                            ? toneClass.success
                            : situacao.tone === "danger"
                              ? toneClass.danger
                              : toneClass.muted,
                        )}
                      >
                        {situacao.label}
                      </span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-border pt-2.5 text-center">
                      {termValues.map((value, termIndex) => (
                        <div key={termIndex}>
                          <p className="text-[10px] text-muted-foreground">{termIndex + 1}º T</p>
                          <p className="tnum text-sm">{formatScore(value)}</p>
                        </div>
                      ))}
                      <div>
                        <p className="text-[10px] text-muted-foreground">MFA</p>
                        <p className="tnum text-sm font-medium">{formatScore(mfa)}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          }
          desktop={
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Nº</TableHead>
                    <TableHead>Aluno</TableHead>
                    <TableHead className="text-right">1º T</TableHead>
                    <TableHead className="text-right">2º T</TableHead>
                    <TableHead className="text-right">3º T</TableHead>
                    <TableHead className="text-right">MFA</TableHead>
                    <TableHead className="text-right">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((student, index) => {
                    const terms = ([1, 2, 3] as const).map((item) =>
                      annualAverage(
                        subjects.map((subject) =>
                          termAverage(termGrades, student.id, subject.id, item),
                        ),
                      ),
                    );
                    const mfa = annualAverage(terms);
                    const situacao =
                      mfa == null
                        ? { label: "Pendente", tone: "muted" as const }
                        : situacaoPauta(mfa, passingGrade);
                    return (
                      <TableRow key={student.id}>
                        <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <UserAvatar
                              {...(student.student_photo_url
                                ? { url: student.student_photo_url }
                                : {})}
                              initials={initialsFromName(student.student_name)}
                              className="size-9 bg-primary-soft text-[11px] font-extrabold text-primary"
                            />
                            <span className="font-semibold">{student.student_name}</span>
                          </div>
                        </TableCell>
                        {terms.map((value, termIndex) => (
                          <TableCell key={termIndex} className="text-right">
                            {formatScore(value)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-bold">{formatScore(mfa)}</TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              badgeBase,
                              situacao.tone === "success"
                                ? toneClass.success
                                : situacao.tone === "danger"
                                  ? toneClass.danger
                                  : toneClass.muted,
                            )}
                          >
                            {situacao.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          }
        />
      ) : (
        <ResponsiveEntityView
          mobile={
            /*
             * Lançamento de notas no telemóvel (§38). A tabela tem três campos
             * por aluno; a 360px os três `Input` de 80px ficavam com 40px cada e
             * o teclado tapava a linha seguinte.
             *
             * Aqui cada aluno é um cartão com os três campos em grelha, à altura
             * de toque, com `inputMode="decimal"` (teclado numérico com vírgula)
             * e a média a calcular-se em cima. O `Enter` continua a saltar para o
             * campo seguinte — é o mesmo `focusNextCell` e o mesmo `updateDraft`,
             * por isso o botão "Guardar pauta (n)" conta as mesmas linhas
             * pendentes em qualquer dos dois ecrãs.
             */
            <ul className="space-y-2.5">
              {roster.map((student, index) => {
                const draft = drafts[student.id] ?? { mac: "", npp: "", npt: "" };
                const mac = parseScore(draft.mac);
                const npp = parseScore(draft.npp);
                const npt = parseScore(draft.npt);
                const average =
                  mac != null && npp != null && npt != null ? scoreAverage(mac, npp, npt) : null;
                const situacao =
                  average == null
                    ? { label: "Pendente", tone: "muted" as const }
                    : situacaoPauta(average, passingGrade);
                return (
                  <li key={student.id} className="rounded-xl border border-border bg-card p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{student.student_name}</p>
                        <p className="tnum mt-0.5 text-xs text-muted-foreground">
                          {student.registration_number ?? "—"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tnum text-lg leading-none">
                          {average == null ? "—" : average.toFixed(1)}
                        </p>
                        <span
                          className={cn(
                            badgeBase,
                            "mt-1",
                            situacao.tone === "success"
                              ? toneClass.success
                              : situacao.tone === "danger"
                                ? toneClass.danger
                                : toneClass.muted,
                          )}
                        >
                          {situacao.label}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
                      {(["mac", "npp", "npt"] as const).map((field) => (
                        <label key={field} className="block">
                          <span className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">
                            {field}
                          </span>
                          {canEdit ? (
                            <Input
                              aria-label={`${field.toUpperCase()} de ${student.student_name}`}
                              inputMode="decimal"
                              data-pauta-mobile={`${index}-${field}`}
                              className="h-11 text-center text-base"
                              value={draft[field]}
                              placeholder="—"
                              onChange={(event) =>
                                updateDraft(student.id, field, event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  focusNextCell(index, field);
                                }
                              }}
                            />
                          ) : (
                            <span className="tnum block py-2 text-center text-sm">
                              {draft[field] || "—"}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          }
          desktop={
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Nº</TableHead>
                    <TableHead>Aluno</TableHead>
                    <TableHead>Proc.</TableHead>
                    <TableHead
                      className="w-24 text-right"
                      title={angolaGradeScale.components[0].label}
                    >
                      MAC
                    </TableHead>
                    <TableHead
                      className="w-24 text-right"
                      title={angolaGradeScale.components[1].label}
                    >
                      NPP
                    </TableHead>
                    <TableHead
                      className="w-24 text-right"
                      title={angolaGradeScale.components[2].label}
                    >
                      NPT
                    </TableHead>
                    <TableHead className="text-right">Média</TableHead>
                    <TableHead className="text-right">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((student, index) => {
                    const draft = drafts[student.id] ?? { mac: "", npp: "", npt: "" };
                    const mac = parseScore(draft.mac);
                    const npp = parseScore(draft.npp);
                    const npt = parseScore(draft.npt);
                    const average =
                      mac != null && npp != null && npt != null
                        ? scoreAverage(mac, npp, npt)
                        : null;
                    const situacao =
                      average == null
                        ? { label: "Pendente", tone: "muted" as const }
                        : situacaoPauta(average, passingGrade);
                    return (
                      <TableRow key={student.id}>
                        <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <UserAvatar
                              {...(student.student_photo_url
                                ? { url: student.student_photo_url }
                                : {})}
                              initials={initialsFromName(student.student_name)}
                              className="size-9 bg-primary-soft text-[11px] font-extrabold text-primary"
                            />
                            <span className="font-semibold">{student.student_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {student.registration_number ?? "—"}
                        </TableCell>
                        {(["mac", "npp", "npt"] as const).map((field) => (
                          <TableCell key={field} className="text-right">
                            {canEdit ? (
                              <Input
                                aria-label={`${field.toUpperCase()} de ${student.student_name}`}
                                inputMode="decimal"
                                data-pauta={`${index}-${field}`}
                                className="ml-auto h-8 w-20 text-right"
                                value={draft[field]}
                                placeholder="—"
                                onChange={(event) =>
                                  updateDraft(student.id, field, event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    focusNextCell(index, field);
                                  }
                                }}
                              />
                            ) : (
                              draft[field] || "—"
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-bold">
                          {average == null ? "—" : average.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              badgeBase,
                              situacao.tone === "success"
                                ? toneClass.success
                                : situacao.tone === "danger"
                                  ? toneClass.danger
                                  : toneClass.muted,
                            )}
                          >
                            {situacao.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          }
        />
      )}
    </div>
  );
}
