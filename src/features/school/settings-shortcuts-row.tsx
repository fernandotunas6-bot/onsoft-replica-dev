import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function ModuleShortcutsRow() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link to="/calendario">Calendário lectivo</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/acessos">Utilizadores e acessos</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/comunicacoes">Comunicações</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/documentos" hash="modelos">
          Modelos de impressão
        </Link>
      </Button>
    </div>
  );
}
