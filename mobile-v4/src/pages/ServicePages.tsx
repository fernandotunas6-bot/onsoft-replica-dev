import { InstitutionalNotifications } from "../components/InstitutionalNotifications";
import { InstitutionalChat } from "../components/InstitutionalChat";
import { InstitutionalFinance } from "../components/InstitutionalFinance";
import { InstitutionalGradebooks } from "../components/InstitutionalGradebooks";
import { InstitutionalResults } from "../components/InstitutionalResults";
import { InstitutionalAttendance } from "../components/InstitutionalAttendance";
import type { ApiError } from "../services/api";
import type { Gateway } from "../domain/model";
import type { AcademicCatalog as Catalog } from "../domain/catalog";
import { AcademicCatalog } from "../components/AcademicCatalog";
import type { Session, Workspace, Context, Role, Command } from "../domain/model";
import { Academic } from "../components/Academic";
import { AttendanceMap } from "../components/AttendanceMap";
import { ProfilePage } from "./ProfilePage";
import { ChatPage } from "./ChatPage";
import { serviceCatalog, infoPages, footerGroups, routeFor } from "./catalog";
import { Icon } from "../components/Icon";
export function ServiceFooter({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate: (id: string) => void;
}) {
  return (
    <footer className="service-footer">
      <a
        href="#/perfil"
        className="footer-brand"
        onClick={(e) => {
          e.preventDefault();
          onNavigate("perfil");
        }}
      >
        <span className="brand-mark">S</span>SIGA Plus
      </a>
      <div className="footer-columns">
        {footerGroups.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            {g.links.map(([label, id]) => (
              <a
                key={label}
                href={"#/" + routeFor(id, role)}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(routeFor(id, role));
                }}
              >
                {label}
              </a>
            ))}
          </section>
        ))}
      </div>
      <div className="footer-language">
        <Icon name="school" size={18} /> Português · Angola
      </div>
    </footer>
  );
}
export function ServicePages({
  page,
  session,
  data,
  catalog,
  gateway,
  onAccessError,
  ctx,
  role,
  loading,
  busy,
  execute,
  onNavigate,
  onSelectSchool,
  onSettings,
  onRefresh,
}: {
  page: string;
  session: Session | null;
  data: Workspace | null;
  catalog?: Catalog | null;
  gateway?: Gateway | null;
  onAccessError?: (error: ApiError) => void;
  ctx: Context | null;
  role: Role;
  loading: boolean;
  busy: boolean;
  execute: (c: Command) => Promise<boolean>;
  onNavigate: (id: string) => void;
  onSelectSchool: () => void;
  onSettings: () => void;
  onRefresh?: () => void;
}) {
  const info = infoPages[page];
  const service = serviceCatalog(role).find((m) => m[2] === page);
  return (
    <div className="service-page">
      {page === "perfil" ? (
        <ProfilePage
          key={session?.userId + ":" + ctx?.schoolId}
          session={session}
          data={data}
          catalog={catalog}
          ctx={ctx}
          onSettings={onSettings}
        />
      ) : page === "servicos" ? (
        <>
          <div className="page-eyebrow">Para professores e alunos</div>
          <h1>Os teus serviços</h1>
          <div className="quickgrid">
            {serviceCatalog(role).map(([label, icon, id], i) => (
              <a
                className="quicktile"
                key={id}
                style={{ "--i": i } as React.CSSProperties}
                href={"#/" + id}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(id);
                }}
              >
                <span className="tileicon">
                  <Icon name={icon} />
                </span>
                <span>{label}</span>
                <Icon name="chevron-right" size={17} />
              </a>
            ))}
          </div>
        </>
      ) : info ? (
        <>
          <div className="page-eyebrow">SIGA Plus · serviços escolares</div>
          <h1>{info.title}</h1>
          <div className="card">
            <p>{info.intro}</p>
            {info.items.map((i) => (
              <p key={i} className="info-line">
                <Icon name="check" size={18} />
                <span>{i}</span>
              </p>
            ))}
          </div>
          <div className="flow-actions">
            <button className="pill" onClick={() => onNavigate("servicos")}>
              Ver serviços
            </button>
            <button className="pill" onClick={() => onNavigate("mensagens")}>
              Abrir chat escolar
            </button>
            {page === "escola" && (
              <button className="pill" onClick={onSelectSchool}>
                Seleccionar escola
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="page-eyebrow">
            {ctx?.role === "professor" ? "Trabalho do professor" : "Espaço do aluno"}
          </div>
          <h1>
            {session?.mode === "api" && page === "notas" && role === "professor"
              ? "Consultar notas"
              : page === "calendario"
                ? "Calendário"
                : service?.[0] || "Serviço indisponível"}
          </h1>
          {ctx && onRefresh && (
            <button className="pill" disabled={loading || busy} onClick={onRefresh}>
              Actualizar dados
            </button>
          )}
          {!ctx ? (
            <div className="card">
              <p>Selecciona uma escola e um perfil autorizado para abrir este serviço.</p>
              <button className="pill" onClick={onSelectSchool}>
                Seleccionar escola
              </button>
            </div>
          ) : loading ? (
            <p role="status">A carregar…</p>
          ) : gateway && session?.mode === "api" && page === "avisos" ? (
            <InstitutionalNotifications
              key={ctx.userId + ctx.schoolId + ctx.role}
              ctx={ctx}
              gateway={gateway}
              onAccessError={onAccessError}
            />
          ) : catalog && gateway && ["calendario", "presencas", "faltas"].includes(page) ? (
            <InstitutionalAttendance
              key={ctx.userId + ctx.schoolId + ctx.role + page}
              catalog={catalog}
              ctx={ctx}
              gateway={gateway}
              onAccessError={onAccessError}
            />
          ) : catalog &&
            gateway &&
            ctx.role === "aluno" &&
            ["notas", "notas-aluno"].includes(page) ? (
            <InstitutionalResults
              key={ctx.userId + ctx.schoolId + ctx.role + page}
              ctx={ctx}
              catalog={catalog}
              gateway={gateway}
              onAccessError={onAccessError}
            />
          ) : catalog && gateway && ctx.role === "professor" && page === "notas" ? (
            <InstitutionalGradebooks
              key={ctx.userId + ctx.schoolId + ctx.role + page}
              ctx={ctx}
              catalog={catalog}
              gateway={gateway}
              onAccessError={onAccessError}
            />
          ) : catalog &&
            gateway &&
            ctx.role === "aluno" &&
            ["propinas", "propinas-pagas"].includes(page) ? (
            <InstitutionalFinance
              key={ctx.userId + ctx.schoolId + page}
              ctx={ctx}
              catalog={catalog}
              gateway={gateway}
              onAccessError={onAccessError}
              paidOnly={page === "propinas-pagas"}
            />
          ) : catalog && gateway && page === "mensagens" ? (
            <InstitutionalChat
              key={ctx.userId + ctx.schoolId + ctx.role}
              ctx={ctx}
              gateway={gateway}
              onAccessError={onAccessError}
            />
          ) : catalog ? (
            <AcademicCatalog
              key={ctx.userId + ctx.schoolId + ctx.role + page}
              catalog={catalog}
              module={page}
              onNavigate={onNavigate}
            />
          ) : data ? (
            page === "calendario" ? (
              <AttendanceMap data={data} ctx={ctx} />
            ) : page === "mensagens" ? (
              <ChatPage
                key={ctx.userId + ctx.schoolId}
                data={data}
                ctx={ctx}
                execute={execute}
                busy={busy}
              />
            ) : service ? (
              <Academic
                key={ctx.userId + ctx.schoolId + page}
                module={page}
                data={data}
                ctx={ctx}
                execute={execute}
                busy={busy}
                onNavigate={onNavigate}
              />
            ) : (
              <div className="card">Este serviço não está disponível para o teu perfil.</div>
            )
          ) : (
            <div className="card">Não foi possível carregar os dados desta escola.</div>
          )}
        </>
      )}
      <ServiceFooter role={role} onNavigate={onNavigate} />
    </div>
  );
}
