import { useEffect, useState } from 'react'
import { commands, type DesktopOfflineReadiness } from '@/lib/tauri-bindings'
import {
  BookOpen,
  Database,
  ExternalLink,
  LockKeyhole,
  Monitor,
  Wifi,
  WifiOff,
} from 'lucide-react'

/**
 * Primeira entrada HTML escolar empacotada. Não faz pedidos à rede, não lê
 * armazenamento, não simula matrículas/notas e não possui comandos privilegiados.
 */
export function OfflineSchoolShell() {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const [readiness, setReadiness] = useState<DesktopOfflineReadiness | null>(
    null
  )
  const [readinessError, setReadinessError] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [portalError, setPortalError] = useState(false)

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [])

  useEffect(() => {
    let active = true
    void commands
      .desktopOfflineReadiness()
      .then(result => {
        if (!active) return
        if (result.status === 'ok') {
          setReadiness(result.data)
        } else {
          setReadinessError(true)
        }
      })
      .catch(() => {
        if (active) setReadinessError(true)
      })
    return () => {
      active = false
    }
  }, [])

  async function openRemotePortal() {
    if (!online || openingPortal) return
    setOpeningPortal(true)
    setPortalError(false)
    try {
      const result = await commands.openSigaPortal()
      if (result.status === 'error') setPortalError(true)
    } catch {
      setPortalError(true)
    } finally {
      setOpeningPortal(false)
    }
  }

  return (
    <main className="min-h-screen overflow-y-auto bg-background px-5 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <img src="/siga-icon.png" alt="" className="size-12 rounded-xl" />
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                SIGA Plus Desktop
              </p>
              <h1 className="text-xl font-semibold">Base escolar local</h1>
            </div>
          </div>
          <div
            role="status"
            className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm"
          >
            {online ? (
              <Wifi className="size-4" aria-hidden="true" />
            ) : (
              <WifiOff className="size-4" aria-hidden="true" />
            )}
            <span>{online ? 'Com Internet' : 'Sem Internet'}</span>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            Pré-visualização técnica · sem dados escolares
          </p>
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            A primeira interface escolar já vive no instalador.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Esta página abre localmente, mesmo sem Internet.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            Não contém alunos, notas, presenças nem informações pessoais.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            O portal escolar mantém o acesso autorizado aos módulos reais.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            A base cifrada e a sincronização segura serão entregues por fases.
          </p>
        </section>

        <section
          aria-label="Preparação da aplicação escolar"
          className="grid gap-4 sm:grid-cols-3"
        >
          <article className="rounded-xl border border-border bg-card p-5">
            <Monitor aria-hidden="true" className="mb-4 size-6" />
            <h3 className="font-medium">Interface instalada</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Código e estilos incluídos no SIGA Desktop.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5">
            <Database aria-hidden="true" className="mb-4 size-6" />
            <h3 className="font-medium">Dados locais</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Ainda indisponíveis. SQLite cifrado e migrações em preparação.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5">
            <LockKeyhole aria-hidden="true" className="mb-4 size-6" />
            <h3 className="font-medium">Segurança institucional</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Sem contas nem ficheiros pessoais nesta pré-visualização.
            </p>
          </article>
        </section>

        <section aria-label="Diagnóstico nativo do funcionamento offline">
          <h2 className="text-base font-semibold">Diagnóstico do Desktop</h2>
          {readiness ? (
            <div className="mt-3 grid gap-3 rounded-xl border border-border bg-card p-5 text-sm sm:grid-cols-2">
              <p>Versão instalada: {readiness.appVersion}</p>
              <p>
                Interface local:{' '}
                {readiness.bundledUiReady ? 'Disponível' : 'Indisponível'}
              </p>
              <p>Esquema SQLite v{readiness.schemaVersion}: apenas preparado</p>
              <p>
                SQLCipher:{' '}
                {readiness.sqlcipherReady ? 'Disponível' : 'Pendente'}
              </p>
              <p>
                Autorização offline:{' '}
                {readiness.authorizedBootstrapReady ? 'Disponível' : 'Pendente'}
              </p>
              <p>
                Sincronização bidireccional:{' '}
                {readiness.bidirectionalSyncReady ? 'Disponível' : 'Pendente'}
              </p>
              <p>
                Dados privados offline:{' '}
                {readiness.privateDataOfflineReady
                  ? 'Disponíveis'
                  : 'Bloqueados'}
              </p>
              <p>
                Actualizador assinado:{' '}
                {readiness.signedUpdaterConfigured
                  ? 'Configurado'
                  : 'Não configurado'}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {readinessError
                ? 'Não foi possível consultar o estado nativo. Nenhum acesso offline adicional foi activado.'
                : 'A consultar as capacidades instaladas…'}
            </p>
          )}
        </section>

        <section
          aria-label="Regressar ao portal escolar"
          className="rounded-xl border border-border bg-card p-5"
        >
          <h2 className="text-base font-semibold">Continuar no portal escolar</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Quando a ligação regressar, abra o portal completo para consultar
            dados e trabalhar com a sua escola. Esta janela local permanece
            disponível sem Internet.
          </p>
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!online || openingPortal}
            onClick={() => void openRemotePortal()}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {openingPortal ? 'A abrir portal…' : 'Abrir portal escolar'}
          </button>
          {!online && (
            <p className="mt-2 text-sm text-muted-foreground">
              Sem ligação. O botão ficará disponível quando a rede regressar.
            </p>
          )}
          {portalError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              O portal não pôde ser aberto. Verifique a Internet e tente novamente.
            </p>
          )}
        </section>

        <footer className="flex items-start gap-3 text-sm text-muted-foreground">
          <BookOpen aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p>
            Para trabalhar com turmas, continue a utilizar o portal escolar. A
            base local será ampliada após testes de segurança e sincronização.
          </p>
        </footer>
      </div>
    </main>
  )
}
