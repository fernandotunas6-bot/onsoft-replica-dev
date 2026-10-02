import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import "@/styles.css";
import { PageHeader } from "@/components/layout/PageHeader";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { ListPaginationBar } from "@/components/filters/ListPaginationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FormModal,
  ModalContent,
  ModalHeader,
  ModalShell,
  WizardModal,
} from "@/components/ui/modal-system";
import {
  StudentMobileList,
  type StudentMobileRecord,
} from "@/features/students/components/StudentMobileList";
import { StudentStatusBadge } from "@/features/students/components/StudentStatusBadge";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { DeleteConfirmModal, ModalFooter } from "@/components/ui/modal-system";

const records: StudentMobileRecord[] = Array.from({ length: 57 }, (_, index) => ({
  id: `example-${index}`,
  registration_number: String(1000001 + index),
  full_name:
    index % 2 ? "João Manuel — aluno de exemplo" : "Maria de Jesus da Conceição — aluna de exemplo",
  student_status: index % 2 ? "applicant" : "active",
  payment_status: index % 2 ? "pending" : "overdue",
  debt_amount: index % 2 ? undefined : 125000,
  grade_name: "10.ª classe",
  class_name: "Ciências Físicas e Biológicas · Turma A",
  academic_year: "2026/2027",
  primary_guardian_name: "Encarregado de educação de exemplo",
  email: "contacto.de.educacao.com.nome.comprido@example.test",
  phone: "+244 900 000 000",
}));

export function Review() {
  const [values, setValues] = useState({ q: "", turma: "todas", estado: "todos", data: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState(false);
  const [alert, setAlert] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [locked, setLocked] = useState(false);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(0);
  const [quickSaved, setQuickSaved] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(0);
  const [detail, setDetail] = useState(false);
  const paged = records.slice((page - 1) * pageSize, page * pageSize);
  const activeCount =
    Object.entries(values).filter(
      ([key, value]) => value && value !== "todas" && value !== "todos" && key !== "q",
    ).length + (values.q ? 1 : 0);

  return (
    <main className="mx-auto min-w-0 max-w-[1180px] space-y-5 p-4 sm:p-6">
      <p className="text-xs text-muted-foreground">
        Revisão visual · componentes reais com dados fictícios
      </p>
      <PageHeader
        group="Secretaria"
        title="Gestão de estudantes"
        icon={GraduationCap}
        description="Consulte os alunos, ajuste os filtros e acompanhe cada matrícula."
        actions={
          <>
            <Button onClick={() => setForm(true)}>Nova matrícula</Button>
            <Button variant="outline" onClick={() => setWizard(true)}>
              Cadastro por etapas
            </Button>
            <Button variant="outline" onClick={() => setAlert(true)}>
              Confirmar alteração
            </Button>
          </>
        }
      />
      <div data-testid="filters">
        <ListFilterBar
          fields={[
            { name: "q", label: "Pesquisa", placeholder: "Nome, número ou contacto" },
            {
              name: "turma",
              type: "select",
              label: "Turma",
              options: [
                { value: "todas", label: "Todas as turmas" },
                { value: "a", label: "Ciências Físicas e Biológicas · turma com nome comprido" },
              ],
            },
            {
              name: "estado",
              type: "select",
              label: "Estado",
              options: [
                { value: "todos", label: "Todos os estados" },
                { value: "active", label: "Activo" },
              ],
            },
            { name: "data", type: "date", label: "Data de matrícula" },
          ]}
          values={values}
          activeCount={activeCount}
          onChange={(name, value) => setValues((previous) => ({ ...previous, [name]: value }))}
          onReset={() => setValues({ q: "", turma: "todas", estado: "todos", data: "" })}
          chips={
            values.turma === "a"
              ? [
                  {
                    name: "turma",
                    label: "Turma",
                    value: "Ciências Físicas e Biológicas · turma com nome comprido",
                    emptyValue: "todas",
                  },
                ]
              : []
          }
        />
      </div>
      <Tabs defaultValue="students">
        <TabsList aria-label="Secções da gestão escolar">
          <TabsTrigger value="students">Alunos</TabsTrigger>
          <TabsTrigger value="enrollment">Matrículas e transferências</TabsTrigger>
          <TabsTrigger value="finance">Situação financeira e recibos</TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="space-y-3">
          <StudentMobileList
            students={paged}
            selectedIds={selectedIds}
            onSelect={(id, selected) =>
              setSelectedIds((previous) =>
                selected ? [...new Set([...previous, id])] : previous.filter((item) => item !== id),
              )
            }
            onView={() => setForm(true)}
            renderAvatar={(student) => (
              <span
                role="img"
                aria-label={student.full_name}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary"
              >
                {student.full_name.slice(0, 1)}
              </span>
            )}
          />
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº estudante</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Turma</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>{student.registration_number}</TableCell>
                    <TableCell>{student.full_name}</TableCell>
                    <TableCell>{student.class_name}</TableCell>
                    <TableCell>
                      <StudentStatusBadge status={student.student_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="enrollment">
          <p className="text-sm">As matrículas usam os mesmos componentes de formulário.</p>
        </TabsContent>
        <TabsContent value="finance">
          <p className="text-sm">As acções financeiras mantêm os controlos partilhados.</p>
        </TabsContent>
      </Tabs>
      <ListPaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={records.length}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
      />
      <div className="max-w-full sm:max-w-lg">
        <label className="mb-1 block text-xs font-medium">Selecção com nome comprido</label>
        <Select defaultValue="long">
          <SelectTrigger aria-label="Curso">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="long">
              Curso de Ciências Físicas e Biológicas com nome comprido
            </SelectItem>
            <SelectItem value="short">Ciências</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button variant="ghost" onClick={() => setLocked(true)}>
        Abrir painel protegido
      </Button>
      <QuickFormModal
        title="Configurar trimestre — amostra local"
        fields={[
          { name: "nome", label: "Nome do trimestre" },
          { name: "turno", label: "Turno", type: "select", options: ["Manhã", "Tarde"] },
          { name: "inicio", label: "Início do trimestre", type: "date" },
        ]}
        trigger={(open) => <Button onClick={open}>Formulário rápido</Button>}
        onSubmit={async () => {
          setQuickSaved((previous) => previous + 1);
        }}
      />
      <Button onClick={() => setDeleting(true)}>Rever eliminação</Button>
      <Button onClick={() => setDetail(true)}>Rever ficha longa</Button>
      <output data-testid="quick-saved" className="sr-only">
        {quickSaved}
      </output>
      <output data-testid="deleted" className="sr-only">
        {deleted}
      </output>
      <DeleteConfirmModal
        open={deleting}
        onOpenChange={setDeleting}
        title="Eliminar exemplo local"
        itemName="Registo fictício"
        onConfirm={() => {
          setDeleted((previous) => previous + 1);
          setDeleting(false);
        }}
      />
      <ModalShell open={detail} onOpenChange={setDetail} size="lg">
        <div className="flex min-h-0 max-h-[inherit] flex-col overflow-hidden">
          <ModalHeader
            title="Ficha longa — estrutura de consulta"
            onClose={() => setDetail(false)}
          />
          <ModalContent>
            {Array.from({ length: 20 }, (_, index) => (
              <p key={index}>
                Secção de consulta {index + 1}: informação de exemplo com conteúdo longo.
              </p>
            ))}
          </ModalContent>
          <ModalFooter onCancel={() => setDetail(false)} cancelLabel="Fechar ficha" />
        </div>
      </ModalShell>
      <output data-testid="saved" className="sr-only">
        {saved}
      </output>
      <output data-testid="selected" className="sr-only">
        {selectedIds.join(",")}
      </output>
      <output data-testid="search" className="sr-only">
        {values.q}
      </output>
      <FormModal
        open={form}
        onOpenChange={setForm}
        title="Nova matrícula de estudante — ano lectivo 2026/2027"
        subtitle="Preencha os dados obrigatórios. Esta amostra verifica apenas a interface."
        submitLabel="Guardar matrícula"
        onSubmit={() => setSaved((previous) => previous + 1)}
      >
        <label className="block space-y-1 text-xs">
          Nome completo
          <Input required aria-label="Nome completo" />
        </label>
        <label className="block space-y-1 text-xs">
          E-mail
          <Input required type="email" aria-label="E-mail obrigatório" />
        </label>
        {Array.from({ length: 8 }, (_, index) => (
          <label key={index} className="block space-y-1 text-xs">
            Informação complementar {index + 1}
            <Input aria-label={`Informação complementar ${index + 1}`} />
          </label>
        ))}
        <label className="block space-y-1 text-xs">
          Observações
          <Textarea aria-label="Observações" />
        </label>
      </FormModal>
      <WizardModal
        open={wizard}
        onOpenChange={setWizard}
        title="Cadastro do aluno por etapas"
        subtitle="Amostra local de navegação e dimensionamento."
        currentStepIndex={step}
        onStepChange={setStep}
        steps={[
          { id: "identity", label: "Identificação do estudante" },
          { id: "school", label: "Vínculo institucional" },
          { id: "contacts", label: "Contactos e responsáveis" },
        ]}
        onSubmit={() => setWizard(false)}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <label key={index} className="block space-y-1 text-xs">
            Campo da etapa {index + 1}
            <Input aria-label={`Campo da etapa ${index + 1}`} />
          </label>
        ))}
      </WizardModal>
      <AlertDialog open={alert} onOpenChange={setAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração do registo seleccionado</AlertDialogTitle>
            <AlertDialogDescription>
              Verifique os dados antes de confirmar. O formulário deve preservar o contexto da
              escola e os valores introduzidos mesmo com descrições compridas e em ecrãs pequenos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar à revisão</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ModalShell open={locked} onOpenChange={setLocked} preventOutsideClose>
        <ModalHeader title="Painel protegido" onClose={() => setLocked(false)} />
        <ModalContent>Clicar fora deste painel mantém-no aberto.</ModalContent>
      </ModalShell>
    </main>
  );
}

const root = createRootRoute({ component: Outlet });
const home = createRoute({ getParentRoute: () => root, path: "/", component: Review });
const student = createRoute({
  getParentRoute: () => root,
  path: "/alunos/$studentId",
  component: () => <p>Destino da ficha do aluno nesta amostra.</p>,
});
const router = createRouter({
  routeTree: root.addChildren([home, student]),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
