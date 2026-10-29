import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, Search, UserPlus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { searchPeople } from "@/features/people/server";
import { assignStaffPosition, listStaffPositions } from "./staff-positions-server";

export function AssignStaffPositionDialog({ person }: { person?: { id: string; name: string } }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(person ?? null);
  const [positionId, setPositionId] = useState("");
  const [positionName, setPositionName] = useState("");
  const [positionCategory, setPositionCategory] = useState<
    "teacher" | "staff" | "director" | "management" | "support" | "other"
  >("staff");
  const [departmentId, setDepartmentId] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (open) setSelectedPerson(person ?? null);
  }, [open, person?.id, person?.name]);
  const positions = useQuery({
    queryKey: ["hr", "positions", account.schoolId],
    queryFn: () => listStaffPositions(),
    enabled: open,
    retry: false,
  });
  const people = useQuery({
    queryKey: ["people", "staff-position-search", account.schoolId, debounced],
    queryFn: () => searchPeople({ data: { query: debounced, limit: 15 } }),
    enabled: open && !person && debounced.length >= 2,
    retry: false,
  });
  const canSubmit = Boolean(
    selectedPerson &&
    (positionId === "new" ? positionName.trim().length >= 2 : Boolean(positionId)),
  );
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 size-4" /> Atribuir cargo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="size-5" /> Atribuir cargo profissional
            </DialogTitle>
            <DialogDescription>
              A ficha da pessoa é preservada. O vínculo RH fica em preparação até concluir
              documentação e contratação; isto não concede acesso administrativo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pessoa</Label>
              {selectedPerson ? (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <span className="text-sm font-semibold">{selectedPerson.name}</span>
                  {!person ? (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedPerson(null)}>
                      Alterar
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Procurar por nome, BI ou e-mail"
                      aria-label="Procurar pessoa por nome, BI ou e-mail"
                      className="pl-9"
                    />
                  </div>
                  {people.isLoading ? (
                    <p className="text-xs text-muted-foreground">A procurar pessoas…</p>
                  ) : null}
                  {people.isError ? (
                    <p className="text-xs text-destructive">Não foi possível procurar pessoas.</p>
                  ) : null}
                  <div className="max-h-40 overflow-auto rounded-lg border border-border">
                    {(people.data ?? []).map((personRow) => (
                      <button
                        type="button"
                        key={personRow.id}
                        className="flex w-full min-h-12 items-center border-b border-border px-3 py-2 text-left text-sm hover:bg-muted/30"
                        onClick={() =>
                          setSelectedPerson({ id: personRow.id, name: personRow.full_name })
                        }
                      >
                        {personRow.full_name}
                      </button>
                    ))}
                    {!people.isLoading && debounced.length >= 2 && !people.data?.length ? (
                      <p className="p-3 text-xs text-muted-foreground">
                        Nenhum resultado. Cadastre a pessoa em Pessoas.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Cargo</span>
              <select
                aria-label="Cargo profissional"
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Seleccionar cargo</option>
                {(positions.data?.positions ?? []).map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
                <option value="new">+ Criar novo cargo</option>
              </select>
            </label>
            {positionId === "new" ? (
              <div className="space-y-2">
                <Label htmlFor="new-position-name">Nome do novo cargo</Label>
                <Input
                  id="new-position-name"
                  value={positionName}
                  onChange={(e) => setPositionName(e.target.value)}
                  placeholder="Ex.: Coordenador do Ensino Médio"
                  maxLength={120}
                />
              </div>
            ) : null}
            {positionId === "new" ? (
              <label className="block space-y-2">
                <span className="text-sm font-semibold">Categoria profissional</span>
                <select
                  aria-label="Categoria do novo cargo"
                  value={positionCategory}
                  onChange={(event) =>
                    setPositionCategory(event.target.value as typeof positionCategory)
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="staff">Funcionário administrativo</option>
                  <option value="teacher">Docente / Professor</option>
                  <option value="director">Direcção</option>
                  <option value="management">Coordenação / Gestão</option>
                  <option value="support">Serviços de apoio</option>
                  <option value="other">Outro</option>
                </select>
              </label>
            ) : null}
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Departamento (opcional)</span>
              <select
                aria-label="Departamento do funcionário"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Utilizar o departamento do cargo / não atribuído</option>
                {(positions.data?.departments ?? []).map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {positions.isError ? (
              <p className="text-xs text-destructive">
                Não foi possível consultar os cargos desta escola.
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button
                disabled={!canSubmit || saving || positions.isError}
                onClick={async () => {
                  if (!selectedPerson) return;
                  setSaving(true);
                  try {
                    const result = await assignStaffPosition({
                      data: {
                        personId: selectedPerson.id,
                        ...(positionId !== "new"
                          ? { positionId }
                          : {
                              newPositionName: positionName.trim(),
                              newPositionCategory: positionCategory,
                            }),
                        ...(departmentId ? { departmentId } : {}),
                      },
                    });
                    await queryClient.invalidateQueries({ queryKey: ["hr", "employees"] });
                    await queryClient.invalidateQueries({ queryKey: ["people"] });
                    toast.success("Cargo associado. O funcionário já consta no RH.");
                    setOpen(false);
                    void navigate({
                      to: "/financeiro/rh/funcionarios/$employmentId",
                      params: { employmentId: result.employmentId },
                    });
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Não foi possível atribuir o cargo.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "A guardar…" : "Atribuir cargo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
