import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Panel } from "@/components/layout/PageHeader";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { moduleIcons } from "@/lib/app-icons";
import {
  getMyTeacherContactVisibility,
  setMyTeacherContactVisibility,
} from "./teacher-contact-visibility";

const QUERY_KEY = ["teacher-contact-visibility"] as const;

/** O professor decide se alunos e encarregados vêem o seu e-mail e telefone. */
export function TeacherContactVisibilityPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getMyTeacherContactVisibility(),
  });
  const mutation = useMutation({
    mutationFn: (visible: boolean) => setMyTeacherContactVisibility({ data: { visible } }),
    onSuccess: (result) => {
      queryClient.setQueryData(QUERY_KEY, { isTeacher: true as const, visible: result.visible });
      toast.success(
        result.visible
          ? "Alunos e encarregados passam a ver o seu contacto."
          : "O seu contacto fica oculto para alunos e encarregados.",
      );
    },
    onError: (error) =>
      toast.error("Não foi possível guardar.", {
        description: error instanceof Error ? error.message : undefined,
      }),
  });

  if (!query.data?.isTeacher) return null;
  const visible = mutation.isPending ? !query.data.visible : query.data.visible;

  return (
    <Panel
      title="Contacto para alunos"
      description="A direcção, a secretaria e os colegas vêem sempre o seu contacto."
      icon={moduleIcons.people}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="teacher-contact-visible">
            Mostrar o meu e-mail e telefone a alunos e encarregados
          </Label>
          <p className="text-xs text-muted-foreground">
            {visible
              ? "Visível na lista de professores da escola."
              : "Oculto: alunos e encarregados vêem só o seu nome."}
          </p>
        </div>
        <Switch
          id="teacher-contact-visible"
          checked={visible}
          disabled={mutation.isPending}
          onCheckedChange={(checked) => mutation.mutate(checked)}
        />
      </div>
    </Panel>
  );
}
