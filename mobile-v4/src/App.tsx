import { UpcomingClasses } from "./components/UpcomingClasses";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Command, Context, Gateway, Role, Session, Workspace } from "./domain/model";
import type { AcademicCatalog } from "./domain/catalog";
import { DemoGateway } from "./services/demo";
import { ApiError } from "./services/api";
import { Icon } from "./components/Icon";
import { Sheet } from "./components/Sheet";
import { Academic, teacherModules, studentModules } from "./components/Academic";
import { ServicePages } from "./pages/ServicePages";
import { ChatPage } from "./pages/ChatPage";
import { serviceCatalog, routeFor } from "./pages/catalog";
import "./styles.css";
type Project = { id: string; name: string; favorite: boolean };
const tabs = [
  ["home", "house", "Início"],
  ["projects", "grid-2x2", "Projectos"],
  ["chats", "messages-square", "Conversas"],
  ["daily", "book-open", "Meu dia"],
];
const menu = [
  ["Caixa de entrada", "inbox", "inbox"],
  ["Novidades", "bell", "news"],
  ["Perfil", "user-round", "profile-detail"],
  ["Configurações da conta", "settings", "settings"],
  ["Conectores", "plug", "connectors"],
  ["Suporte", "circle-help", "support"],
  ["Documentação", "book-open", "docs"],
  ["Aparência", "moon", "appearance"],
  ["Comunidade", "users", "community"],
];
export function App({ initialGateway }: { initialGateway?: Gateway }) {
  const [gateway, setGateway] = useState<Gateway | null>(initialGateway || null);
  const [authRevision, setAuthRevision] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [school, setSchool] = useState("");
  const [role, setRole] = useState<Role>("professor");
  const [data, setData] = useState<Workspace | null>(null);
  const [catalog, setCatalog] = useState<AcademicCatalog | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState("home");
  const [sheet, setSheet] = useState("");
  const [module, setModule] = useState("");
  const [page, setPage] = useState(() => location.hash.slice(2));
  const readRoute = () => (location.hash.startsWith("#/") ? location.hash.slice(2) : "");
  useEffect(() => {
    const changed = () => {
      setPage(readRoute());
      setSheet("");
    };
    window.addEventListener("hashchange", changed);
    window.addEventListener("popstate", changed);
    return () => {
      window.removeEventListener("hashchange", changed);
      window.removeEventListener("popstate", changed);
    };
  }, []);
  const [theme, setTheme] = useState(() => localStorage.getItem("siga-mobile-theme") || "Sistema");
  const [bg, setBg] = useState(() => Number(localStorage.getItem("siga-mobile-bg")) || 0);
  const [compact, setCompact] = useState(
    () => localStorage.getItem("siga-mobile-compact") === "true",
  );
  const [systemDark, setSystemDark] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [prompt, setPrompt] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [rename, setRename] = useState("");
  const [install, setInstall] = useState<Event | null>(null);
  const membership = session?.memberships.find((m) => m.schoolId === school && m.active);
  const schoolName = membership?.schoolName || "Por seleccionar";
  const ctx = useMemo<Context | null>(
    () => (session && membership ? { userId: session.userId, schoolId: school, role } : null),
    [session, membership, school, role],
  );
  const key = ctx ? `${ctx.userId}:${ctx.schoolId}:${ctx.role}` : "";
  const activeKey = useRef(key);
  activeKey.current = key;
  const currentCatalog = loadedKey === key ? catalog : null;
  const currentData = loadedKey === key ? data : null;
  useEffect(
    () =>
      gateway?.subscribeSessionChanged?.(() => {
        setSession(null);
        setSchool("");
        setData(null);
        setCatalog(null);
        setLoadedKey("");
        setProjects([]);
        setSheet("");
        setAuthRevision((r) => r + 1);
      }),
    [gateway],
  );
  useEffect(() => {
    if (!gateway) return;
    let live = true;
    const ac = new AbortController();
    setLoading(true);
    setError("");
    gateway
      .session(ac.signal)
      .then((s) => {
        if (live) {
          setSession(s);
          if (s) {
            setRole(s.memberships.find((m) => m.active)?.roles[0] || "professor");
          }
        }
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            setSchool("");
            setCatalog(null);
            setData(null);
            if (e.status === 401) {
              setSession(null);
              if (!initialGateway) setGateway(null);
            }
          }
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, [gateway, authRevision, initialGateway]);
  useEffect(() => {
    setData(null);
    setCatalog(null);
    setLoadedKey("");
    setProjects([]);
    setFilter("");
    setBusy(false);
    if (!gateway || !ctx) {
      setLoading(false);
      return;
    }
    let live = true;
    const ac = new AbortController();
    setError("");
    setNotice("");
    setLoading(true);
    const request =
      session?.mode === "api"
        ? gateway.academicCatalog
          ? gateway.academicCatalog(ctx, ac.signal).then((d) => {
              if (live) setCatalog(d);
            })
          : Promise.reject(new Error("O catálogo académico não está disponível nesta ligação."))
        : gateway.workspace(ctx, ac.signal).then((d) => {
            if (live) setData(d);
          });
    request
      .then(() => {
        if (live) setLoadedKey(key);
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            setSchool("");
            setCatalog(null);
            setData(null);
            if (e.status === 401) {
              setSession(null);
              if (!initialGateway) setGateway(null);
            }
          }
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, [gateway, ctx, key, reload, session?.mode, initialGateway]);
  useEffect(() => {
    const q = matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(q.matches);
    const change = () => setSystemDark(q.matches);
    q.addEventListener("change", change);
    const update = () => setOnline(navigator.onLine);
    const installEvent = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("beforeinstallprompt", installEvent);
    return () => {
      q.removeEventListener("change", change);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", installEvent);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("siga-mobile-theme", theme);
    localStorage.setItem("siga-mobile-bg", String(bg));
    localStorage.setItem("siga-mobile-compact", String(compact));
  }, [theme, bg, compact]);
  function selectSchool(id: string) {
    setData(null);
    setCatalog(null);
    setProjects([]);
    setSheet("");
    setSchool(id);
    setModule("");
  }
  async function startDemo(next: Role) {
    setData(null);
    setCatalog(null);
    setSheet("");
    setSchool("");
    setRole(next);
    if (gateway instanceof DemoGateway) {
      gateway.setRole(next);
      setSession(await gateway.session());
    } else setGateway(new DemoGateway(next, true));
  }
  async function logout() {
    try {
      await gateway?.signOut();
    } catch {
      setError("Não foi possível confirmar a saída no servidor.");
    } finally {
      setData(null);
      setCatalog(null);
      setSession(null);
      setSchool("");
      setProjects([]);
      setSheet("");
      if (!initialGateway) setGateway(null);
      setNotice("Sessão terminada; contexto local limpo.");
    }
  }
  async function execute(command: Command) {
    if (!gateway || !ctx || !currentData) return false;
    if (!online && session?.mode === "api") {
      setError("Sem ligação. Volta a ligar para guardar.");
      return false;
    }
    const requestKey = key;
    setBusy(true);
    setError("");
    try {
      await gateway.execute(ctx, command);
      const next = await gateway.workspace(ctx);
      if (activeKey.current === requestKey) {
        setData(next);
        setLoadedKey(requestKey);
        setNotice(
          session?.mode === "demo" ? "Guardado no ambiente de teste." : "Guardado no SIGA Plus.",
        );
      }
      return activeKey.current === requestKey;
    } catch (e) {
      if (activeKey.current === requestKey) {
        setError((e as Error).message);
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setData(null);
          setCatalog(null);
          setProjects([]);
          setSchool("");
          setSheet("");
          if (e.status === 401) {
            setSession(null);
            if (!initialGateway) setGateway(null);
          }
        }
      }
      return false;
    } finally {
      if (activeKey.current === requestKey) setBusy(false);
    }
  }
  function navigatePage(id: string) {
    const resolved = routeFor(id, role);
    setPage(resolved);
    setSheet("");
    setNotice("");
    history.pushState(null, "", "#/" + resolved);
  }
  function openModule(id: string) {
    setModule(id);
    navigatePage(id);
  }
  function createProject() {
    if (!ctx) {
      setSheet("workspace");
      return;
    }
    if (!prompt.trim()) return;
    setProjects([
      ...projects,
      {
        id: crypto.randomUUID(),
        name: prompt.trim().slice(0, 160),
        favorite: false,
      },
    ]);
    setPrompt("");
    setTab("projects");
  }
  const row = (label: string, icon: string, action: () => void) => (
    <button className="menurow" onClick={action}>
      <span className="symbol">
        <Icon name={icon} />
      </span>
      <span>{label}</span>
    </button>
  );
  const moduleTitle =
    [...teacherModules, ...studentModules].find((m) => m[2] === module)?.[0] || "Actividade";
  const selectedProject = projects.find((p) => p.id === projectId);
  const dark = theme === "Escuro" || (theme === "Sistema" && systemDark);
  const sheetTitle: Record<string, string> = {
    profile: "Conta",
    appearance: "Aparência",
    workspace: "Seleccionar escola",
    settings: "Configurações",
    connectors: "Conectores",
    news: "Novidades",
    inbox: "Caixa de entrada",
    search: "Pesquisar",
    filters: "Filtros",
    attachments: "Anexos",
    projectmenu: "Projecto",
    rename: "Editar projecto",
    academic: moduleTitle,
    "profile-detail": "Perfil",
    support: "Suporte",
    docs: "Documentação",
    community: "Comunidade",
    request: "Solicitar acesso",
  };
  return (
    <div
      id="app"
      className={
        (bg === 0 ? "gradient" : bg === 1 ? "bg-one" : "bg-two") +
        (dark ? " dark" : "") +
        (compact ? " compact" : "")
      }
    >
      <header className={page ? "top service-top" : "top"} inert={!!sheet}>
        {page ? (
          <>
            <button className="brand-link" onClick={() => navigatePage("perfil")}>
              <span className="brand-mark">S</span>
              <span>SIGA Plus</span>
            </button>
            <div className="actions">
              <button
                className="open-siga"
                onClick={() => {
                  navigatePage("");
                  setTab("daily");
                }}
              >
                Abrir SIGA Plus
              </button>
              <button
                className="round menu-toggle"
                aria-label="Abrir menu de serviços"
                onClick={() => setSheet("full-menu")}
              >
                <Icon name="menu" />
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              className="workspace"
              onClick={() => setSheet("workspace")}
              aria-label={"Seleccionar escola. Actual: " + schoolName}
            >
              <span className="avatar">
                {membership?.schoolLogoUrl?.startsWith("/") ? (
                  <img
                    className="school-logo"
                    src={membership.schoolLogoUrl}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  "S"
                )}
              </span>
              {schoolName}
              <Icon name="chevron-down" size={18} />
            </button>
            <button className="profile" aria-label="Conta" onClick={() => setSheet("profile")}>
              <Icon name="user-round" size={23} />
            </button>
          </>
        )}
      </header>
      <main className="content" inert={!!sheet}>
        {!online && (
          <p className="status" role="status">
            Sem ligação ·{" "}
            {session?.mode === "demo" ? "teste local disponível" : "gravação indisponível"}
          </p>
        )}
        {session?.mode === "demo" && (
          <div className="demo-badge">Demonstração · dados fictícios · sem ligação à produção</div>
        )}
        {!page && tab === "home" && (
          <>
            <div style={{ textAlign: "center", paddingTop: "12vh" }}>
              <div className="small">O teu espaço de gestão escolar</div>
              <h1 style={{ fontSize: 38 }}>Como podemos ajudar?</h1>
            </div>
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                createProject();
              }}
            >
              <label className="sr-only" htmlFor="prompt">
                Descreve o que pretendes fazer na escola
              </label>
              <input
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Descreve o que pretendes fazer na escola…"
                maxLength={160}
              />
              <div className="composerfoot">
                <button
                  type="button"
                  className="round"
                  aria-label="Anexos"
                  onClick={() => setSheet("attachments")}
                >
                  <Icon name="plus" size={24} />
                </button>
                <span>Construir ⌄</span>
                <button className="round" aria-label="Criar projecto local" type="submit">
                  <Icon name="arrow-up" size={24} />
                </button>
              </div>
            </form>
          </>
        )}
        {!page && tab === "daily" && (
          <>
            <div className="headerline">
              <div>
                <div className="small">SIGA PLUS · ACESSO RÁPIDO</div>
                <h1>Meu dia</h1>
              </div>
              <button
                className="round"
                aria-label="Seleccionar escola"
                onClick={() => setSheet("workspace")}
              >
                <Icon name="school" />
              </button>
            </div>
            <div className="card">
              <div className="small">ESCOLA ACTIVA</div>
              <h2>{schoolName}</h2>
              <p className="muted">
                {session
                  ? session.name + " · " + role
                  : "Autentica a sessão institucional ou abre a demonstração."}
              </p>
              <button className="pill" onClick={() => setSheet("workspace")}>
                <Icon name="chevron-down" size={16} /> Seleccionar escola
              </button>
            </div>
            {!session && (
              <div className="card">
                <b>Testar os percursos</b>
                <p className="muted">
                  Escolas e alunos fictícios, guardados apenas durante esta sessão.
                </p>
                <div className="flow-actions">
                  <button className="pill" onClick={() => startDemo("professor")}>
                    Testar como professor
                  </button>
                  <button className="pill" onClick={() => startDemo("aluno")}>
                    Testar como aluno
                  </button>
                </div>
              </div>
            )}
            {session?.mode === "demo" && (
              <div className="rolebar">
                <button
                  className={"pill " + (role === "professor" ? "role-active" : "")}
                  onClick={() => startDemo("professor")}
                >
                  <Icon name="book-open" size={18} /> Professor
                </button>
                <button
                  className={"pill " + (role === "aluno" ? "role-active" : "")}
                  onClick={() => startDemo("aluno")}
                >
                  <Icon name="user-round" size={18} /> Aluno
                </button>
              </div>
            )}
            {session?.mode === "api" && membership && membership.roles.length > 1 && (
              <label>
                Perfil autorizado
                <select
                  value={role}
                  onChange={(e) => {
                    setData(null);
                    setCatalog(null);
                    setRole(e.target.value as Role);
                  }}
                >
                  {membership.roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <h2>{role === "professor" ? "Trabalho do professor" : "Espaço do aluno"}</h2>
            <div className="quickgrid">
              {(role === "professor" ? teacherModules : studentModules).map(
                ([label, icon, id], i) => (
                  <button
                    className="quicktile"
                    key={id}
                    style={{ "--i": i } as React.CSSProperties}
                    onClick={() => openModule(id)}
                  >
                    <span className="tileicon">
                      <Icon name={icon} size={24} />
                    </span>
                    <span>
                      {session?.mode === "api" && id === "aulas" ? "Horário semanal" : label}
                    </span>
                    <Icon name="chevron-right" size={17} />
                  </button>
                ),
              )}
            </div>
            <div className="card agenda">
              <b>Próximas actividades</b>
              {loading ? (
                <p role="status">A carregar…</p>
              ) : currentCatalog ? (
                <UpcomingClasses catalog={currentCatalog} onNavigate={openModule} />
              ) : currentData?.lessons.length ? (
                currentData.lessons.map((l) => (
                  <button
                    className="menurow"
                    key={l.id}
                    onClick={() => openModule(role === "professor" ? "aulas" : "horario")}
                  >
                    <span>
                      {l.date} · {l.time}
                      <br />
                      {l.topic}
                    </span>
                  </button>
                ))
              ) : (
                <p className="muted">
                  {school
                    ? "Sem actividades disponíveis."
                    : "Selecciona uma escola para consultar a agenda."}
                </p>
              )}
            </div>
          </>
        )}
        {!page && tab === "projects" && (
          <>
            <div className="headerline">
              <h1>Projectos</h1>
              <div className="actions">
                <button
                  className="round"
                  aria-label="Pesquisar projectos"
                  onClick={() => setSheet("search")}
                >
                  <Icon name="search" size={24} />
                </button>
                <button className="round" aria-label="Filtros" onClick={() => setSheet("filters")}>
                  <Icon name="list-filter" size={24} />
                </button>
              </div>
            </div>
            <p className="muted">Organização local desta sessão escolar.</p>
            {projects
              .filter(
                (p) =>
                  p.name.toLowerCase().includes(filter.toLowerCase()) && (!favorites || p.favorite),
              )
              .map((p) => (
                <div className="project" key={p.id}>
                  <div className="thumb" />
                  <div className="grow">
                    <div className="name">
                      {p.favorite ? "★ " : ""}
                      {p.name}
                    </div>
                    <div className="muted">{schoolName} · projecto local</div>
                  </div>
                  <button
                    className="dots"
                    aria-label={"Acções de " + p.name}
                    onClick={() => {
                      setProjectId(p.id);
                      setSheet("projectmenu");
                    }}
                  >
                    <Icon name="ellipsis" size={24} />
                  </button>
                </div>
              ))}
            {!projects.length && (
              <div className="card">Sem projectos. Cria um no separador Início.</div>
            )}
          </>
        )}
        {!page && tab === "chats" && (
          <>
            <h1>Conversas</h1>
            {ctx && currentData ? (
              <ChatPage key={key} data={currentData} ctx={ctx} execute={execute} busy={busy} />
            ) : ctx && session?.mode === "api" ? (
              <div className="card" role="status">
                <p>O chat institucional ainda aguarda integração validada.</p>
                <button
                  className="pill"
                  onClick={() => navigatePage(role === "professor" ? "turmas" : "disciplinas")}
                >
                  Consultar disciplinas
                </button>
              </div>
            ) : (
              <div className="card">
                <p>Selecciona uma escola para abrir o chat.</p>
                <button className="pill" onClick={() => setSheet("workspace")}>
                  Seleccionar escola
                </button>
              </div>
            )}
          </>
        )}
        {page && (
          <>
            <div className="page-context">
              <button
                className="round"
                aria-label="Voltar a Meu dia"
                onClick={() => {
                  navigatePage("");
                  setTab("daily");
                }}
              >
                <Icon name="chevron-left" />
              </button>
              <button className="pill" onClick={() => setSheet("workspace")}>
                {schoolName}
                <Icon name="chevron-down" size={16} />
              </button>
            </div>
            <ServicePages
              page={page}
              session={session}
              data={currentData}
              catalog={currentCatalog}
              gateway={gateway}
              onAccessError={(e) => {
                setError(e.message);
                setData(null);
                setCatalog(null);
                setProjects([]);
                setSchool("");
                setSheet("");
                if (e.status === 401) {
                  setSession(null);
                  if (!initialGateway) setGateway(null);
                }
              }}
              onRefresh={() => setReload((r) => r + 1)}
              ctx={ctx}
              role={role}
              loading={loading}
              busy={busy}
              execute={execute}
              onNavigate={navigatePage}
              onSelectSchool={() => setSheet("workspace")}
              onSettings={() => setSheet("settings")}
            />
          </>
        )}
        {!sheet && error && (
          <div className="error" role="alert">
            {error}
            <button className="pill" onClick={() => setReload((r) => r + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {!sheet && notice && <p role="status">{notice}</p>}
      </main>
      <nav className="nav" aria-label="Navegação principal" inert={!!sheet}>
        {tabs.map(([id, icon, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-label={label}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              navigatePage("");
              setTab(id);
              setNotice("");
            }}
          >
            <Icon name={icon} size={27} />
          </button>
        ))}
      </nav>
      {sheet && (
        <Sheet title={sheetTitle[sheet] || sheet} onClose={() => setSheet("")}>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          {sheet === "academic" &&
            (!ctx ? (
              <div className="card">
                <p>Selecciona uma escola e um perfil autorizado para abrir este módulo.</p>
                <button className="pill" onClick={() => setSheet("workspace")}>
                  Seleccionar escola
                </button>
              </div>
            ) : loading ? (
              <p role="status">A carregar…</p>
            ) : currentData ? (
              <Academic
                key={key + module}
                module={module}
                data={currentData}
                ctx={ctx}
                execute={execute}
                busy={busy}
                onNavigate={openModule}
              />
            ) : (
              <div className="card">
                <p>Não foi possível carregar os dados.</p>
                <button className="pill" onClick={() => setReload((r) => r + 1)}>
                  Tentar novamente
                </button>
              </div>
            ))}
          {sheet === "full-menu" && (
            <div className="full-menu">
              <h2>SIGA Plus</h2>
              <details open>
                <summary>Serviços escolares</summary>
                {serviceCatalog(role).map(([label, icon, id]) => (
                  <a
                    key={id}
                    className="menurow"
                    href={"#/" + id}
                    onClick={(e) => {
                      e.preventDefault();
                      navigatePage(id);
                    }}
                  >
                    <Icon name={icon} />
                    {label}
                    <Icon name="chevron-right" />
                  </a>
                ))}
              </details>
              {[
                ["O meu perfil", "perfil"],
                ["Recursos", "recursos"],
                ["Comunidade escolar", "mensagens"],
                ["A minha escola", "escola"],
                ["Segurança", "seguranca"],
                ["Privacidade", "privacidade"],
                ["Instalar aplicação", "instalacao"],
              ].map(([label, id]) => (
                <a
                  key={id}
                  href={"#/" + id}
                  className="menurow"
                  onClick={(e) => {
                    e.preventDefault();
                    navigatePage(id);
                  }}
                >
                  {label}
                  <Icon name="chevron-right" />
                </a>
              ))}
            </div>
          )}
          {sheet === "workspace" && (
            <>
              <div className="small">ESCOLA ACTUAL</div>
              {row(schoolName, "school", () => setSheet(""))}
              <div className="line" />
              <div className="small">ESCOLAS COM VÍNCULO ACTIVO</div>
              {session?.memberships
                .filter((m) => m.active)
                .map((m) => (
                  <div key={m.schoolId}>
                    {row(m.schoolName, m.schoolId === school ? "check" : "school", () => {
                      setRole(m.roles[0]);
                      selectSchool(m.schoolId);
                    })}
                  </div>
                ))}
              {!session && (
                <div className="card">
                  <b>Nenhuma sessão autenticada</b>
                  <p className="muted">A integração real está desactivada nesta versão.</p>
                  <button className="pill" onClick={() => startDemo("professor")}>
                    Abrir demonstração
                  </button>
                </div>
              )}
              {session && !session.memberships.some((m) => m.active) && (
                <p>Nenhum vínculo activo.</p>
              )}
              {row("Por seleccionar", "school", () => selectSchool(""))}
              {row("Configurações do espaço escolar", "settings", () => setSheet("settings"))}
              {row("Solicitar acesso a uma escola", "plus", () => setSheet("request"))}
            </>
          )}
          {sheet === "profile" && (
            <>
              <div className="card">
                <b>{session?.name || "Sem sessão institucional"}</b>
                <p className="muted">
                  {session?.mode === "demo"
                    ? "Conta de demonstração"
                    : session
                      ? "Sessão SIGA Plus"
                      : "Autenticação real por integrar"}
                </p>
                <p className="muted">
                  {schoolName} · {role === "professor" ? "Professor" : "Aluno"}
                </p>
                {session && (
                  <p className="muted">
                    {session.memberships.filter((m) => m.active).length} escola(s) com vínculo
                    activo
                  </p>
                )}
                <button className="pill" onClick={() => setSheet("workspace")}>
                  Gerir escola activa
                </button>
              </div>
              {menu.map(([label, icon, id]) => (
                <div key={id}>
                  {row(label, icon, () => {
                    const routes: Record<string, string> = {
                      "profile-detail": "perfil",
                      support: "suporte",
                      docs: "manual",
                      community: "mensagens",
                      connectors: "integracoes",
                      news: "recursos",
                      inbox: "mensagens",
                    };
                    if (routes[id]) navigatePage(routes[id]);
                    else setSheet(id);
                  })}
                </div>
              ))}
              {install &&
                row("Instalar aplicação", "monitor-smartphone", async () => {
                  await (install as Event & { prompt: () => Promise<void> }).prompt();
                  setInstall(null);
                })}
              {row("Todos os serviços", "grid-2x2", () => navigatePage("servicos"))}
              {row("Menu de serviços", "list-filter", () => setSheet("full-menu"))}
              {session && row("Terminar sessão", "user-round", logout)}
            </>
          )}
          {sheet === "appearance" && (
            <>
              <h3>Tema</h3>
              <div className="choices">
                {["Sistema", "Claro", "Escuro"].map((t, i) => (
                  <button
                    key={t}
                    className={"choice " + (theme === t ? "selected" : "")}
                    aria-pressed={theme === t}
                    onClick={() => setTheme(t)}
                  >
                    <Icon name={["monitor-smartphone", "sun", "moon"][i]} size={26} />
                    <div>{t}</div>
                  </button>
                ))}
              </div>
              <h3>Plano de fundo do painel</h3>
              <div className="swatches">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    className={"swatch " + (bg === i ? "selected" : "")}
                    aria-label={"Gradiente " + (i + 1)}
                    aria-pressed={bg === i}
                    onClick={() => setBg(i)}
                  />
                ))}
              </div>
              <p className="muted">Respeita a preferência de movimento reduzido do dispositivo.</p>
            </>
          )}
          {sheet === "settings" && (
            <>
              {row("Escola seleccionada: " + schoolName, "school", () => setSheet("workspace"))}
              {row("Aparência", "moon", () => setSheet("appearance"))}
              {row("Conectores", "plug", () => setSheet("connectors"))}
              <div className="card">
                <label className="setting-toggle">
                  <span>
                    <b>Vista compacta</b>
                    <span className="muted">Menos espaços e painéis mais discretos.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={compact}
                    onChange={(e) => setCompact(e.target.checked)}
                  />
                </label>
              </div>
              <div className="card">
                Mobile V4 · aplicação isolada. As definições institucionais continuam no SIGA Plus.
              </div>
            </>
          )}
          {sheet === "search" && (
            <label>
              Pesquisar
              <input
                className="search"
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button className="pill" onClick={() => setSheet("")}>
                Aplicar pesquisa
              </button>
            </label>
          )}
          {sheet === "filters" && (
            <>
              {row("Todos", "list-filter", () => {
                setFavorites(false);
                setFilter("");
                setSheet("");
              })}
              {row("Favoritos", "star", () => {
                setFavorites(true);
                setSheet("");
              })}
            </>
          )}
          {sheet === "projectmenu" && selectedProject && (
            <>
              <p>{selectedProject.name}</p>
              {row("Adicionar aos favoritos", "star", () => {
                setProjects(
                  projects.map((p) => (p.id === projectId ? { ...p, favorite: !p.favorite } : p)),
                );
                setSheet("");
              })}
              {row("Copiar", "copy", () => {
                setProjects([
                  ...projects,
                  {
                    ...selectedProject,
                    id: crypto.randomUUID(),
                    name: selectedProject.name + " — cópia",
                  },
                ]);
                setSheet("");
              })}
              {row("Editar", "pencil", () => {
                setRename(selectedProject.name);
                setSheet("rename");
              })}
              {row("Conversar sobre este projecto", "messages-square", () =>
                openModule("mensagens"),
              )}
              {row("Excluir", "trash-2", () => setSheet("delete-project"))}
              {[
                "Abrir em nova aba",
                "Remixar",
                "Abrir",
                "Mover",
                "Configurações",
                "Publicar no perfil",
              ].map((label) => (
                <div key={label}>{row(label, "external-link", () => setSheet(label))}</div>
              ))}
            </>
          )}
          {sheet === "rename" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (rename.trim()) {
                  setProjects(
                    projects.map((p) => (p.id === projectId ? { ...p, name: rename.trim() } : p)),
                  );
                  setSheet("");
                }
              }}
            >
              <label>
                Nome do projecto
                <input
                  value={rename}
                  maxLength={160}
                  required
                  onChange={(e) => setRename(e.target.value)}
                />
              </label>
              <button className="pill" type="submit">
                Guardar
              </button>
            </form>
          )}
          {sheet === "delete-project" && (
            <div className="card">
              <p>Excluir este projecto local?</p>
              <button
                className="pill"
                onClick={() => {
                  setProjects(projects.filter((p) => p.id !== projectId));
                  setSheet("");
                }}
              >
                Confirmar exclusão
              </button>
            </div>
          )}
          {sheet === "connectors" && (
            <>
              <h2>Serviços institucionais</h2>
              <p className="muted">
                As ligações são geridas pela escola no SIGA Plus. Esta aplicação não solicita
                palavras-passe de terceiros.
              </p>
              {[
                [
                  "SIGA Plus",
                  session?.mode === "api"
                    ? "Sessão institucional disponível"
                    : "Aguardando autenticação institucional",
                ],
                [
                  "Mensagens",
                  currentData
                    ? "Área de mensagens disponível neste contexto"
                    : "Selecciona uma escola para consultar",
                ],
                [
                  "Documentos",
                  currentData
                    ? "Pedidos de documentos disponíveis neste contexto"
                    : "Selecciona uma escola para consultar",
                ],
              ].map(([name, status]) => (
                <div className="card" key={name}>
                  <b>{name}</b>
                  <p className="muted">{status}</p>
                </div>
              ))}
              <button className="pill" onClick={() => navigatePage("integracoes")}>
                Ver integrações
              </button>
            </>
          )}
          {sheet === "news" && (
            <div className="card">
              <h3>Mobile V4</h3>
              <p>Chamadas, notas, planos, tarefas e entregas disponíveis no modo de teste.</p>
            </div>
          )}
          {sheet === "attachments" && (
            <div className="card">
              <p>
                O carregamento de ficheiros requer armazenamento institucional e permissões no
                servidor.
              </p>
              <button className="pill" onClick={() => setSheet("connectors")}>
                Ligar conector
              </button>
            </div>
          )}
          {sheet === "inbox" && (
            <>
              <p>
                {session?.mode === "api"
                  ? "O chat institucional ainda aguarda integração validada."
                  : `${currentData?.messages.length || 0} mensagens neste contexto escolar.`}
              </p>
              <button className="pill" onClick={() => openModule("mensagens")}>
                Abrir mensagens
              </button>
            </>
          )}
          {![
            "full-menu",
            "academic",
            "workspace",
            "profile",
            "appearance",
            "settings",
            "search",
            "filters",
            "projectmenu",
            "rename",
            "delete-project",
            "connectors",
            "news",
            "attachments",
            "inbox",
          ].includes(sheet) && (
            <div className="card">
              <p>
                {sheet === "profile-detail"
                  ? session?.name || "Sem sessão"
                  : sheet === "request"
                    ? "O pedido de vínculo institucional será ligado ao fluxo de aprovação da secretaria."
                    : sheet === "profile-detail"
                      ? "Consulta o teu perfil e os vínculos escolares activos na área de conta."
                      : sheet === "support"
                        ? "Para obter apoio, contacta a secretaria da escola seleccionada. Indica o serviço e a hora do problema, sem partilhar palavras-passe."
                        : sheet === "docs"
                          ? "Começa por seleccionar a escola e o papel. Em Meu dia podes consultar aulas, tarefas, presenças e mensagens disponíveis."
                          : sheet === "community"
                            ? "A comunicação escolar está disponível na área Mensagens, respeitando os vínculos e permissões."
                            : "Este serviço depende da activação institucional no SIGA Plus."}
              </p>
              <p className="muted">Sem alterações na produção.</p>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
