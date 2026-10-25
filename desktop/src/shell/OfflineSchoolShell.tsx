import { useEffect, useState } from 'react'
import {
  BookOpen,
  Database,
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

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [])

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

        <footer className="flex items-start gap-3 text-sm text-muted-foreground">
          <BookOpen aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p>
            Para trabalhar com turmas, continue a utilizar o portal escolar.
            A base local será ampliada após testes de segurança e sincronização.
          </p>
        </footer>
      </div>
    </main>
  )
}
