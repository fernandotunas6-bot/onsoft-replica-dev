import type { AcademicCatalog } from "../domain/catalog";
import { useState } from "react";
import type { Session, Workspace, Context } from "../domain/model";
import { AttendanceMap } from "../components/AttendanceMap";
import { Icon } from "../components/Icon";
export function ProfilePage({
  session,
  data,
  catalog,
  ctx,
  onSettings,
}: {
  session: Session | null;
  data: Workspace | null;
  catalog?: AcademicCatalog | null;
  ctx: Context | null;
  onSettings: () => void;
}) {
  const [displayName, setDisplayName] = useState(session?.name || "O teu perfil");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  return (
    <section className="profile-page">
      <div className="profile-cover" />
      <div className="profile-tools">
        <div className="profile-avatar" aria-label="Avatar do perfil">
          {displayName
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0])
            .join("")}
        </div>
        <div className="actions">
          <button
            className="round"
            aria-label="Editar nome no perfil de teste"
            onClick={() => setEditing(true)}
            disabled={session?.mode !== "demo"}
          >
            <Icon name="pencil" />
          </button>
          <button className="round" aria-label="Configurações do perfil" onClick={onSettings}>
            <Icon name="settings" />
          </button>
        </div>
      </div>
      <h1>{displayName}</h1>
      <div className="profile-meta">
        <span>
          {ctx?.role === "professor"
            ? "Professor"
            : ctx?.role === "aluno"
              ? "Aluno"
              : "Conta escolar"}
        </span>
        <span>{session?.memberships.filter((m) => m.active).length || 0} vínculos activos</span>
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) {
              setDisplayName(draft.trim());
              setEditing(false);
            }
          }}
        >
          <label>
            Nome de apresentação (teste)
            <input
              required
              maxLength={80}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button className="pill" type="submit">
            Guardar nome
          </button>
          <p className="small">Alteração local desta sessão de teste.</p>
        </form>
      )}
      <div className="profile-empty">
        <Icon name="book-open" size={42} />
        <h2>
          {catalog
            ? `${ctx?.role === "professor" ? new Set(catalog.classes.map((c) => c.classGroupId)).size : catalog.classes.length} ${ctx?.role === "professor" ? "turmas atribuídas" : "disciplinas activas"}`
            : data
              ? `${data.classes.length} ${ctx?.role === "professor" ? "turmas atribuídas" : "disciplinas activas"}`
              : "Selecciona a tua escola"}
        </h2>
        <p className="muted">
          {catalog
            ? "Consulta as disciplinas, os horários e os trabalhos publicados nos serviços académicos."
            : data
              ? "Aulas, presenças e serviços do teu dia, num só lugar."
              : "O mapa académico surge depois de autenticar e seleccionar uma escola."}
        </p>
      </div>
      {data && ctx && <AttendanceMap data={data} ctx={ctx} annual />}
    </section>
  );
}
