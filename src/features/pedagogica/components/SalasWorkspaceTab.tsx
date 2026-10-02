import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DoorOpen,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  Sparkles,
  Building2,
  Pencil,
} from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listRooms, createRoom, updateRoom } from "@/features/academic/server";
import { toast } from "sonner";
import { EMPTY_LIST } from "@/lib/stable-empty";
import { errorMessage } from "@/lib/error-message";
import type { RoomType } from "@/features/academic/schemas";

/** Colunas de `rooms` usadas aqui (confirmadas em supabase/PRODUCTION_SNAPSHOT.json). */
type RoomRow = {
  id: string;
  code: string;
  name: string;
  capacity: number | null;
  status: string | null;
  room_type: string | null;
  building: string | null;
  block: string | null;
  floor: string | null;
  notes: string | null;
  /** Turmas activas com esta sala fixa (`class_groups.room_id`). */
  turmas: string[];
};

const roomTypeLabels: Record<string, string> = {
  standard: "Sala Comum",
  computer_lab: "Lab. de Informática",
  physics_lab: "Lab. de Física",
  chemistry_lab: "Lab. de Química",
  biology_lab: "Lab. de Biologia",
  multimedia: "Sala Multimédia",
  library: "Biblioteca",
  auditorium: "Auditório",
  workshop: "Oficina Técnica",
  gym: "Ginásio",
  court: "Campo Desportivo",
  meeting_room: "Sala de Reuniões",
};

export function SalasWorkspaceTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("todos");

  const roomsQuery = useQuery({
    queryKey: ["academic", "rooms"],
    queryFn: () => listRooms(),
  });
  const rooms: RoomRow[] = roomsQuery.data ?? EMPTY_LIST;
  const isLoading = roomsQuery.isLoading;

  const filteredRooms = rooms.filter((room) => {
    const q = query.trim().toLowerCase();
    const matchQ =
      !q ||
      room.name.toLowerCase().includes(q) ||
      room.code.toLowerCase().includes(q) ||
      (room.block && room.block.toLowerCase().includes(q));
    const matchType = selectedType === "todos" || room.room_type === selectedType;
    return matchQ && matchType;
  });

  const totalCapacidade = rooms.reduce((sum: number, r) => sum + (r.capacity ?? 0), 0);
  const laboratoriosCount = rooms.filter(
    (r) => r.room_type?.includes("lab") || r.room_type === "multimedia",
  ).length;

  const handleCreateRoom = async (values: Record<string, string | undefined>) => {
    try {
      const code = values["codigo"]?.trim() || "";
      const name = values["nome"]?.trim() || "";
      const capacity = Number(values["capacidade"] || 35);
      const roomType = values["tipo"] || "standard";
      const block = values["bloco"]?.trim() || undefined;
      const building = values["edificio"]?.trim() || undefined;
      const floor = values["piso"]?.trim() || undefined;

      await createRoom({
        data: {
          code,
          name,
          capacity,
          roomType: roomType as RoomType,
          block,
          building,
          floor,
          resources: [],
          accessibility: true,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["academic", "rooms"] });
      toast.success("Sala cadastrada com sucesso.");
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao criar sala."));
    }
  };

  const handleUpdateRoom = async (room: RoomRow, values: Record<string, string | undefined>) => {
    try {
      await updateRoom({
        data: {
          id: room.id,
          code: values["codigo"]?.trim() || room.code,
          name: values["nome"]?.trim() || room.name,
          capacity: Number(values["capacidade"] || room.capacity),
          roomType: (values["tipo"] || room.room_type) as RoomType,
          // "" apaga o valor (o servidor grava null); antes ficava o antigo.
          block: values["bloco"] ?? "",
          building: values["edificio"] ?? "",
          floor: values["piso"] ?? "",
          status: values["estado"] === "inactive" ? "inactive" : "active",
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["academic", "rooms"] });
      toast.success("Sala atualizada com sucesso.");
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao atualizar sala."));
    }
  };

  return (
    <div className="space-y-6">
      {/* Cards de Resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Total de Salas</span>
            <DoorOpen className="size-5 text-primary" />
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{rooms.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Espaços físicos cadastrados</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Capacidade Total</span>
            <Building2 className="size-5 text-success" />
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {totalCapacidade}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Lugares para estudantes</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Laboratórios & Oficinas
            </span>
            <Monitor className="size-5 text-primary" />
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {laboratoriosCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Ambientes especializados</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Regra de Capacidade</span>
            <CheckCircle2 className="size-5 text-warning" />
          </div>
          <p className="mt-2 text-base font-bold tracking-tight text-foreground">
            Anti-Superlotação
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Uma turma só fica numa sala onde cabe
          </p>
        </div>
      </div>

      <Panel
        title="Salas & Espaços Físicos"
        description="Gestão de salas de aula, laboratórios, capacidades máximas e recursos instalados."
        action={
          canManage && (
            <QuickFormModal
              title="Nova Sala"
              eyebrow="Espaços Físicos"
              description="Cadastre uma sala comum ou especializada para alocação de turmas e horários."
              icon={<Plus className="size-5" />}
              submitLabel="Cadastrar Sala"
              onSubmit={handleCreateRoom}
              fields={[
                {
                  name: "codigo",
                  label: "Código da Sala",
                  placeholder: "Ex: B-12",
                  required: true,
                },
                {
                  name: "nome",
                  label: "Nome / Descrição",
                  placeholder: "Ex: Sala 12 - Bloco B",
                  required: true,
                },
                {
                  name: "capacidade",
                  label: "Capacidade Máxima",
                  type: "number",
                  defaultValue: "35",
                  required: true,
                },
                {
                  name: "tipo",
                  label: "Tipo de Sala",
                  type: "select",
                  options: Object.entries(roomTypeLabels).map(([value, label]) => ({
                    value,
                    label,
                  })),
                  required: true,
                },
                { name: "bloco", label: "Bloco", placeholder: "Ex: Bloco B", required: false },
                {
                  name: "edificio",
                  label: "Edifício",
                  placeholder: "Ex: Edifício Principal",
                  required: false,
                },
                { name: "piso", label: "Piso", placeholder: "Ex: 1.º Andar", required: false },
              ]}
              trigger={(open) => (
                <Button size="sm" className="gap-1.5" onClick={open}>
                  <Plus className="size-3.5" /> Nova Sala
                </Button>
              )}
            />
          )
        }
      >
        {/* Filtros rápidos */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input
              aria-label="Pesquisar sala"
              type="text"
              placeholder="Pesquisar sala por nome, código ou bloco…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <select
            aria-label="Filtrar por tipo de sala"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="todos">Todos os tipos de sala</option>
            {Object.entries(roomTypeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Tabela de Salas */}
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">Código</TableHead>
                <TableHead className="text-xs font-semibold">Nome da Sala</TableHead>
                <TableHead className="text-xs font-semibold">Tipo de Espaço</TableHead>
                <TableHead className="text-xs font-semibold text-center">Capacidade</TableHead>
                <TableHead className="text-xs font-semibold">Turmas</TableHead>
                <TableHead className="text-xs font-semibold">Localização</TableHead>
                <TableHead className="text-xs font-semibold">Estado</TableHead>
                {canManage && (
                  <TableHead className="text-right text-xs font-semibold">Ações</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRooms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                    {isLoading ? "A carregar salas…" : "Nenhuma sala encontrada."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRooms.map((room) => (
                  <TableRow key={room.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs font-bold text-foreground">
                      {room.code}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-foreground">
                      {room.name}
                      {room.notes && (
                        <p className="text-[11px] text-muted-foreground">{room.notes}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                        {room.room_type ? (roomTypeLabels[room.room_type] ?? room.room_type) : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs font-semibold">
                      {room.capacity ? `${room.capacity} alunos` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {room.turmas.length ? room.turmas.join(", ") : "Livre"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[room.building, room.block, room.floor].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          room.status === "active"
                            ? "bg-success/15 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {room.status === "active" ? "Operacional" : "Inativa"}
                      </span>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <QuickFormModal
                          title={`Editar Sala: ${room.name}`}
                          eyebrow="Salas"
                          description="Atualize os dados e capacidade física deste espaço."
                          icon={<Pencil className="size-5" />}
                          submitLabel="Salvar Alterações"
                          successDescription="Sala atualizada com sucesso."
                          onSubmit={(values) => handleUpdateRoom(room, values)}
                          fields={[
                            {
                              name: "codigo",
                              label: "Código da Sala",
                              defaultValue: room.code,
                              required: true,
                            },
                            {
                              name: "nome",
                              label: "Nome / Descrição",
                              defaultValue: room.name,
                              required: true,
                            },
                            {
                              name: "capacidade",
                              label: "Capacidade Máxima",
                              type: "number",
                              defaultValue: String(room.capacity || 35),
                              required: true,
                            },
                            {
                              name: "tipo",
                              label: "Tipo de Sala",
                              type: "select",
                              defaultValue: room.room_type ?? undefined,
                              options: Object.entries(roomTypeLabels).map(([value, label]) => ({
                                value,
                                label,
                              })),
                              required: true,
                            },
                            {
                              name: "estado",
                              label: "Estado",
                              type: "select",
                              defaultValue: room.status === "inactive" ? "inactive" : "active",
                              options: [
                                { value: "active", label: "Operacional" },
                                { value: "inactive", label: "Inactiva (fora de uso)" },
                              ],
                              required: true,
                            },
                            {
                              name: "bloco",
                              label: "Bloco",
                              defaultValue: room.block || "",
                              required: false,
                            },
                            {
                              name: "edificio",
                              label: "Edifício",
                              defaultValue: room.building || "",
                              required: false,
                            },
                            {
                              name: "piso",
                              label: "Piso",
                              defaultValue: room.floor || "",
                              required: false,
                            },
                          ]}
                          trigger={(open) => (
                            <Button variant="ghost" size="sm" className="size-8 p-0" onClick={open}>
                              <Pencil className="size-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
