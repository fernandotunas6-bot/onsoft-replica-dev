import { useMemo, useState } from 'react';
import { Award, Download, Printer, CheckCircle2, FileText, Layers, Copy, FileSpreadsheet, ShieldCheck, GraduationCap, Calendar, Search, Filter, Share2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/layout/PageHeader';
import { toast } from 'sonner';
import type { PedagogicalWorkspace } from '@/features/academic/server';
import { exportCsv } from '@/lib/export-csv';
import { documentValidationCode } from '@/features/academic/assessment-views';
import { whatsappHref } from '@/features/integrations/actions';
import { MiniPautaView } from './MiniPautaView';
import { FinalPautaView } from './FinalPautaView';
import { TrimesterPautaView } from './TrimesterPautaView';
import { ExamPautaView } from './ExamPautaView';
import { finalPautaDemo, miniPautaDemo, trimesterPautaDemo, examPautaDemo } from './pautas-demo';
import type { FinalPautaDocument, MiniPautaDocument, PautaMode, AngolaTeachingCycle, TrimesterPautaDocument, ExamPautaDocument } from './types';
import { calculateFinalDisciplineAverage, calculateTrimesterAverage, evaluateAngolanStatus } from './assessment';
import { buildClassAcademicSummaries } from '@/features/academic/assessment-engine';

interface PautasWorkspaceModuleProps {
  workspace?: PedagogicalWorkspace | null;
  onSelectClassGroup?: (classGroupId: string) => void;
}

export function PautasWorkspaceModule({ workspace, onSelectClassGroup }: PautasWorkspaceModuleProps) {
  const [modelType, setModelType] = useState<PautaMode>('mini');
  const [selectedCycle, setSelectedCycle] = useState<AngolaTeachingCycle>('i_ciclo');
  const [selectedTerm, setSelectedTerm] = useState<number>(1);
  const [selectedClassId, setSelectedClassId] = useState<string>('demo');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('demo');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'fail'>('all');

  const classGroups = workspace?.classGroups ?? [];
  const subjects = workspace?.subjects ?? [];
  const schoolProfile = workspace?.schoolProfile;

  // Verification code for document authenticity
  const validationCode = useMemo(() => documentValidationCode(`PAUTA-${modelType.toUpperCase()}`), [selectedClassId, selectedSubjectId, modelType, selectedTerm]);

  // Mini Pauta Document
  const rawMiniDocument: MiniPautaDocument = useMemo(() => {
    if (selectedClassId === 'demo' || !workspace) {
      return { ...miniPautaDemo, context: { ...miniPautaDemo.context, cycle: selectedCycle } };
    }

    const currentClass = classGroups.find((cg) => cg.id === selectedClassId);
    const currentSubject = subjects.find((s) => s.id === selectedSubjectId) ?? subjects[0];
    const enrollments = workspace.enrollments.filter((e) => e.class_group_id === selectedClassId);

    const students = enrollments.map((e, index) => {
      const studentGrades = workspace.termGrades.filter(
        (g) => g.enrollment_id === e.id && (currentSubject ? g.subject_id === currentSubject.id : true)
      );

      const g1 = studentGrades.find((g) => g.term === 1);
      const g2 = studentGrades.find((g) => g.term === 2);
      const g3 = studentGrades.find((g) => g.term === 3);

      const t1 = {
        mact: g1?.mac ?? null,
        npp: g1?.npp ?? null,
        npt: g1?.npt ?? null,
        mt: calculateTrimesterAverage(g1?.mac, g1?.npt),
      };
      const t2 = {
        mact: g2?.mac ?? null,
        npp: g2?.npp ?? null,
        npt: g2?.npt ?? null,
        mt: calculateTrimesterAverage(g2?.mac, g2?.npt),
      };
      const t3 = {
        mact: g3?.mac ?? null,
        npp: g3?.npp ?? null,
        npt: g3?.npt ?? null,
        mt: calculateTrimesterAverage(g3?.mac, g3?.npt),
      };

      const mfd = calculateFinalDisciplineAverage(t1.mt, t2.mt, t3.mt);
      const status = evaluateAngolanStatus(mfd, 0, selectedCycle);

      return {
        id: e.id,
        code: e.registration_number ?? `EST-${index + 1}`,
        number: index + 1,
        name: e.student_name,
        gender: '' as const,
        t1,
        t2,
        t3,
        mfd,
        status,
        observation: '',
      };
    });

    return {
      school: {
        republic: 'REPÚBLICA DE ANGOLA',
        province: schoolProfile?.province || 'GOVERNO PROVINCIAL',
        municipality: schoolProfile?.municipality || 'ADMINISTRAÇÃO MUNICIPAL',
        educationOffice: 'DIRECÇÃO MUNICIPAL DA EDUCAÇÃO',
        schoolName: schoolProfile?.name || 'COMPLEXO ESCOLAR',
      },
      context: {
        academicYear: workspace.schoolSettings?.current_year || '2025/2026',
        className: currentClass?.grade_name || 'Classe',
        classGroup: currentClass?.name || 'Turma',
        period: currentClass?.shift || 'Manhã',
        teacher: 'Docente Responsável',
        pautaNumber: `P-${currentClass?.name ?? '01'}`,
        cycle: selectedCycle,
      },
      subject: currentSubject?.name || 'Disciplina Geral',
      students: students.length > 0 ? students : miniPautaDemo.students,
      signatures: { teacher: '', pedagogicalDeputy: '', director: '' },
    };
  }, [selectedClassId, selectedSubjectId, selectedCycle, workspace, classGroups, subjects, schoolProfile]);

  // Trimester Pauta Document
  const rawTrimesterDocument: TrimesterPautaDocument = useMemo(() => {
    if (selectedClassId === 'demo' || !workspace) {
      return { ...trimesterPautaDemo, context: { ...trimesterPautaDemo.context, term: selectedTerm, cycle: selectedCycle } };
    }

    const currentClass = classGroups.find((cg) => cg.id === selectedClassId);
    const classSubjects = subjects.length > 0 ? subjects.slice(0, 8) : trimesterPautaDemo.subjects;
    const enrollments = workspace.enrollments.filter((e) => e.class_group_id === selectedClassId);

    const students = enrollments.map((e, index) => {
      const gradesMap: Record<string, number | null> = {};
      let total = 0;
      let count = 0;

      classSubjects.forEach((sub) => {
        const grade = workspace.termGrades.find(
          (g) => g.enrollment_id === e.id && g.subject_id === sub.id && g.term === selectedTerm
        );
        const mt = calculateTrimesterAverage(grade?.mac, grade?.npt);
        gradesMap[sub.id] = mt;
        if (mt !== null) {
          total += mt;
          count += 1;
        }
      });

      const avg = count > 0 ? Math.round((total / count) * 10) / 10 : null;
      const status = evaluateAngolanStatus(avg, 0, selectedCycle);

      return {
        id: e.id,
        code: e.registration_number ?? `EST-${index + 1}`,
        number: index + 1,
        name: e.student_name,
        gender: '' as const,
        subjectGrades: gradesMap,
        average: avg,
        status,
      };
    });

    return {
      school: {
        republic: 'REPÚBLICA DE ANGOLA',
        province: schoolProfile?.province || 'GOVERNO PROVINCIAL',
        municipality: schoolProfile?.municipality || 'ADMINISTRAÇÃO MUNICIPAL',
        educationOffice: 'DIRECÇÃO MUNICIPAL DA EDUCAÇÃO',
        schoolName: schoolProfile?.name || 'COMPLEXO ESCOLAR',
      },
      context: {
        academicYear: workspace.schoolSettings?.current_year || '2025/2026',
        className: currentClass?.grade_name || 'Classe',
        classGroup: currentClass?.name || 'Turma',
        period: currentClass?.shift || 'Manhã',
        term: selectedTerm,
        cycle: selectedCycle,
      },
      subjects: classSubjects.map((s) => ({ id: s.id, name: s.name, shortName: s.name.substring(0, 10).toUpperCase() })),
      students: students.length > 0 ? students : trimesterPautaDemo.students,
      signatures: { classCoordinator: '', pedagogicalDeputy: '', director: '' },
    };
  }, [selectedClassId, selectedTerm, selectedCycle, workspace, classGroups, subjects, schoolProfile]);

  // Final Pauta Document
  const rawFinalDocument: FinalPautaDocument = useMemo(() => {
    if (selectedClassId === 'demo' || !workspace) {
      return { ...finalPautaDemo, context: { ...finalPautaDemo.context, cycle: selectedCycle } };
    }

    const currentClass = classGroups.find((cg) => cg.id === selectedClassId);
    const classSubjects = subjects.length > 0 ? subjects.slice(0, 7) : finalPautaDemo.subjects;
    const enrollments = workspace.enrollments.filter((e) => e.class_group_id === selectedClassId);

    const students = enrollments.map((e, index) => {
      let fails = 0;
      const studentSubjectResults = classSubjects.map((sub) => {
        const studentGrades = workspace.termGrades.filter(
          (g) => g.enrollment_id === e.id && g.subject_id === sub.id
        );
        const g1 = studentGrades.find((g) => g.term === 1);
        const g2 = studentGrades.find((g) => g.term === 2);
        const g3 = studentGrades.find((g) => g.term === 3);

        const mt1 = calculateTrimesterAverage(g1?.mac, g1?.npt);
        const mt2 = calculateTrimesterAverage(g2?.mac, g2?.npt);
        const mt3 = calculateTrimesterAverage(g3?.mac, g3?.npt);
        const mfd = calculateFinalDisciplineAverage(mt1, mt2, mt3);

        if (mfd !== null && mfd < 10) fails += 1;

        return {
          subjectId: sub.id,
          subjectName: sub.name,
          mt1,
          mt2,
          mt3,
          mfd,
        };
      });

      const globalAvgArr = studentSubjectResults.map((x) => x.mfd).filter((x): x is number => x !== null);
      const globalMfd = globalAvgArr.length > 0 ? globalAvgArr.reduce((a, b) => a + b, 0) / globalAvgArr.length : null;
      const status = evaluateAngolanStatus(globalMfd, fails, selectedCycle);

      return {
        id: e.id,
        code: e.registration_number ?? `EST-${index + 1}`,
        number: index + 1,
        name: e.student_name,
        gender: '' as const,
        subjects: studentSubjectResults,
        status,
      };
    });

    return {
      school: {
        republic: 'REPÚBLICA DE ANGOLA',
        province: schoolProfile?.province || 'GOVERNO PROVINCIAL',
        municipality: schoolProfile?.municipality || 'ADMINISTRAÇÃO MUNICIPAL',
        educationOffice: 'DIRECÇÃO MUNICIPAL DA EDUCAÇÃO',
        schoolName: schoolProfile?.name || 'COMPLEXO ESCOLAR',
      },
      context: {
        academicYear: workspace.schoolSettings?.current_year || '2025/2026',
        className: currentClass?.grade_name || 'Classe',
        classGroup: currentClass?.name || 'Turma',
        period: currentClass?.shift || 'Manhã',
        pautaNumber: `PF-${currentClass?.name ?? '01'}`,
        cycle: selectedCycle,
      },
      subjects: classSubjects.map((s) => ({ id: s.id, name: s.name, shortName: s.name.substring(0, 10).toUpperCase() })),
      students: students.length > 0 ? students : finalPautaDemo.students,
      signatures: { jury: ['', '', ''], pedagogicalDeputy: '', director: '' },
    };
  }, [selectedClassId, selectedCycle, workspace, classGroups, subjects, schoolProfile]);

  // Exam Pauta Document
  const rawExamDocument: ExamPautaDocument = useMemo(() => {
    if (selectedClassId === 'demo' || !workspace) {
      return { ...examPautaDemo, isTechnical: selectedCycle === 'tecnico' };
    }

    return {
      school: {
        republic: 'REPÚBLICA DE ANGOLA',
        province: schoolProfile?.province || 'GOVERNO PROVINCIAL',
        municipality: schoolProfile?.municipality || 'ADMINISTRAÇÃO MUNICIPAL',
        educationOffice: 'DIRECÇÃO MUNICIPAL DA EDUCAÇÃO',
        schoolName: schoolProfile?.name || 'INSTITUTO TÉCNICO',
      },
      context: {
        academicYear: workspace.schoolSettings?.current_year || '2025/2026',
        className: '12.ª/13.ª Classe',
        classGroup: 'Turma de Exame',
        period: 'Manhã',
        cycle: selectedCycle,
      },
      isTechnical: selectedCycle === 'tecnico',
      subject: selectedCycle === 'tecnico' ? 'Prova de Aptidão Profissional (PAP) & Estágio' : 'Exame Nacional de Fim de Ciclo',
      students: examPautaDemo.students,
      signatures: { jury: ['', '', ''], pedagogicalDeputy: '', director: '' },
    };
  }, [selectedClassId, selectedCycle, workspace, schoolProfile]);

  // Filtered Documents based on search query and status filter
  const filterStudentList = <T extends { name: string; code?: string; status?: string }>(list: T[]): T[] => {
    return list.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || item.name.toLowerCase().includes(q) || (item.code && item.code.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (statusFilter === 'pass') {
        return item.status === 'TRANSITA' || item.status === 'APROVADO' || item.status === 'APTO' || item.status === 'APTO (PAP)';
      }
      if (statusFilter === 'fail') {
        return item.status === 'NÃO TRANSITA' || item.status === 'REPROVADO' || item.status === 'NÃO APTO' || item.status === 'NÃO APTO (PAP)' || item.status === 'RECURSO';
      }
      return true;
    });
  };

  const filteredMiniDocument = useMemo(() => ({ ...rawMiniDocument, students: filterStudentList(rawMiniDocument.students) }), [rawMiniDocument, searchQuery, statusFilter]);
  const filteredTrimesterDocument = useMemo(() => ({ ...rawTrimesterDocument, students: filterStudentList(rawTrimesterDocument.students) }), [rawTrimesterDocument, searchQuery, statusFilter]);
  const filteredFinalDocument = useMemo(() => ({ ...rawFinalDocument, students: filterStudentList(rawFinalDocument.students) }), [rawFinalDocument, searchQuery, statusFilter]);
  const filteredExamDocument = useMemo(() => ({ ...rawExamDocument, students: filterStudentList(rawExamDocument.students) }), [rawExamDocument, searchQuery, statusFilter]);

  // Active student list based on selected view mode
  const currentStudents = useMemo(() => {
    if (modelType === 'mini') return filteredMiniDocument.students;
    if (modelType === 'trimestre') return filteredTrimesterDocument.students;
    if (modelType === 'final') return filteredFinalDocument.students;
    return filteredExamDocument.students;
  }, [modelType, filteredMiniDocument, filteredTrimesterDocument, filteredFinalDocument, filteredExamDocument]);

  const passCount = currentStudents.filter(
    (s) => s.status === 'TRANSITA' || s.status === 'APROVADO' || s.status === 'APTO' || s.status === 'APTO (PAP)'
  ).length;
  const passRate = currentStudents.length > 0 ? Math.round((passCount / currentStudents.length) * 100) : 0;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const columns = [
      { key: 'number', label: 'N.º' },
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Nome Completo' },
      { key: 'status', label: 'Resultado' },
    ];
    const rows = currentStudents.map((s) => ({
      number: s.number,
      code: s.code ?? '',
      name: s.name,
      status: s.status ?? '',
    }));
    exportCsv(`pauta-${modelType}-${selectedCycle}`, columns, rows);
    toast.success('Pauta exportada em ficheiro CSV.');
  };

  const handleCopyTsv = async () => {
    try {
      let tsvText = 'N.º\tCódigo\tNome Completo\tResultado\n';
      currentStudents.forEach((s) => {
        tsvText += `${s.number}\t${s.code}\t${s.name}\t${s.status}\n`;
      });
      await navigator.clipboard.writeText(tsvText);
      toast.success('Grelha copiada para a área de transferência! Cole no Excel.');
    } catch {
      toast.error('Não foi possível copiar os dados.');
    }
  };

  const handleShareWhatsapp = () => {
    const text = `*RESUMO DA PAUTA SIGA* (${modelType.toUpperCase()})\n` +
      `Escola: ${rawMiniDocument.school.schoolName}\n` +
      `Turma: ${rawMiniDocument.context.classGroup} (${rawMiniDocument.context.className})\n` +
      `Total de Alunos: ${currentStudents.length}\n` +
      `Aprovados/Transitam: ${passCount} (${passRate}%)\n` +
      `Código de Autenticidade: ${validationCode}`;

    window.open(whatsappHref(text), '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <Panel className="p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <Award className="size-3.5" /> Decreto Executivo n.º 424/25
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" /> Sistema Escolar Angolano
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono font-medium text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" /> {validationCode}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Modelos de Pauta Escolar — Contextos de Ensino em Angola</h2>
            <p className="text-xs text-muted-foreground">
              Estruturas normativas para Ensino Primário, I Ciclo, II Ciclo / Liceu, Técnico-Profissional (PAP) e EJA / Adultos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            <Button variant="default" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="size-4" /> Imprimir / PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv}>
              <FileSpreadsheet className="size-4" /> Exportar CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" onClick={handleShareWhatsapp}>
              <MessageSquare className="size-4" /> Partilhar WhatsApp
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={handleCopyTsv}>
              <Copy className="size-3.5" /> Copiar Tabela
            </Button>
          </div>
        </div>

        {/* Quick Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Total de Alunos</p>
            <p className="text-lg font-bold text-foreground">{currentStudents.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Taxa de Transição</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{passRate}%</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Aprovados / Transitam</p>
            <p className="text-lg font-bold text-foreground">{passCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Não Transitam / Retidos</p>
            <p className="text-lg font-bold text-destructive">{currentStudents.length - passCount}</p>
          </div>
        </div>

        {/* Search & Status Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-border no-print">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Pesquisar por aluno ou código..."
              className="pl-9 h-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Filter className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Filtrar:</span>
            <div className="flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                className={`px-2.5 py-1 rounded font-medium text-[11px] transition-all ${
                  statusFilter === 'all' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
                onClick={() => setStatusFilter('all')}
              >
                Todos
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded font-medium text-[11px] transition-all ${
                  statusFilter === 'pass' ? 'bg-background text-emerald-600 font-bold shadow-xs' : 'text-muted-foreground'
                }`}
                onClick={() => setStatusFilter('pass')}
              >
                Aprovados
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded font-medium text-[11px] transition-all ${
                  statusFilter === 'fail' ? 'bg-background text-destructive font-bold shadow-xs' : 'text-muted-foreground'
                }`}
                onClick={() => setStatusFilter('fail')}
              >
                Não Transitam
              </button>
            </div>
          </div>
        </div>

        {/* Selectors Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 no-print pt-2">
          {/* Tipo / Âmbito de Pauta */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground block">Âmbito / Estrutura da Pauta</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-border p-1 bg-muted/40 gap-1">
              <button
                type="button"
                className={`text-[11px] font-semibold py-1.5 px-2 rounded-md transition-all text-center ${
                  modelType === 'mini' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setModelType('mini')}
              >
                <FileText className="size-3 inline mr-1" /> Mini-Pauta
              </button>
              <button
                type="button"
                className={`text-[11px] font-semibold py-1.5 px-2 rounded-md transition-all text-center ${
                  modelType === 'trimestre' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setModelType('trimestre')}
              >
                <Calendar className="size-3 inline mr-1" /> Trimestral
              </button>
              <button
                type="button"
                className={`text-[11px] font-semibold py-1.5 px-2 rounded-md transition-all text-center ${
                  modelType === 'final' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setModelType('final')}
              >
                <Layers className="size-3 inline mr-1" /> Pauta Final
              </button>
              <button
                type="button"
                className={`text-[11px] font-semibold py-1.5 px-2 rounded-md transition-all text-center ${
                  modelType === 'exames' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setModelType('exames')}
              >
                <GraduationCap className="size-3 inline mr-1" /> Exames/PAP
              </button>
            </div>
          </div>

          {/* Nível de Ensino / Ciclo */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground block">Nível de Ensino</label>
            <select
              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-2 focus:ring-primary font-medium"
              value={selectedCycle}
              onChange={(e) => setSelectedCycle(e.target.value as AngolaTeachingCycle)}
            >
              <option value="primario">Ensino Primário (1.ª–6.ª)</option>
              <option value="i_ciclo">I Ciclo Secundário (7.ª–9.ª)</option>
              <option value="ii_ciclo">II Ciclo / Liceu (10.ª–12.ª)</option>
              <option value="tecnico">Técnico-Profissional (PAP)</option>
              <option value="adultos">EJA / Adultos</option>
            </select>
          </div>

          {/* Seleção de Turma */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground block">Turma</label>
            <select
              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-2 focus:ring-primary font-medium"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                if (e.target.value !== 'demo' && onSelectClassGroup) {
                  onSelectClassGroup(e.target.value);
                }
              }}
            >
              <option value="demo">Demonstrativo (Modelo Angola)</option>
              {classGroups.map((cg) => (
                <option key={cg.id} value={cg.id}>
                  {cg.name} ({cg.grade_name || 'Sem classe'})
                </option>
              ))}
            </select>
          </div>

          {/* Seleção de Disciplina / Trimestre */}
          {modelType === 'mini' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground block">Disciplina</label>
              <select
                className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-2 focus:ring-primary font-medium"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
              >
                <option value="demo">Língua Portuguesa (Demonstrativa)</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {modelType === 'trimestre' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground block">Trimestre Lectivo</label>
              <select
                className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-2 focus:ring-primary font-medium"
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(Number(e.target.value))}
              >
                <option value={1}>1.º Trimestre</option>
                <option value={2}>2.º Trimestre</option>
                <option value={3}>3.º Trimestre</option>
              </select>
            </div>
          )}
        </div>
      </Panel>

      {/* Render Area */}
      <div className="w-full">
        {modelType === 'mini' && <MiniPautaView data={filteredMiniDocument} />}
        {modelType === 'trimestre' && <TrimesterPautaView data={filteredTrimesterDocument} />}
        {modelType === 'final' && <FinalPautaView data={filteredFinalDocument} />}
        {modelType === 'exames' && <ExamPautaView data={filteredExamDocument} />}
      </div>
    </div>
  );
}
