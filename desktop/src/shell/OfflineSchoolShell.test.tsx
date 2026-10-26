import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { commands } from '@/lib/tauri-bindings'
import { OfflineSchoolShell } from './OfflineSchoolShell'

describe('SIGA offline school shell', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('renders bundled UI without claiming that school data are available', () => {
    render(<OfflineSchoolShell />)
    expect(
      screen.getByRole('heading', { name: 'Base escolar local' })
    ).toBeVisible()
    expect(screen.getByText(/Ainda indisponíveis/)).toBeVisible()
    expect(screen.getByText(/sem dados escolares/i)).toBeVisible()
  })

  it('shows truthful status from native Rust without school data', async () => {
    render(<OfflineSchoolShell />)
    await waitFor(() =>
      expect(screen.getByText('Versão instalada: 1.3.0')).toBeVisible()
    )
    expect(screen.getByText('SQLCipher: Pendente')).toBeVisible()
    expect(screen.getByText('Dados privados offline: Bloqueados')).toBeVisible()
    expect(commands.desktopOfflineReadiness).toHaveBeenCalledOnce()
  })

  it('fails closed when the native status command is unavailable', async () => {
    vi.mocked(commands.desktopOfflineReadiness).mockRejectedValueOnce(
      new Error('Indisponível')
    )
    render(<OfflineSchoolShell />)
    expect(
      await screen.findByText(/Nenhum acesso offline adicional foi activado/)
    ).toBeVisible()
  })

  it('opens only the fixed school portal when online', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    render(<OfflineSchoolShell />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir portal escolar' })
    )
    await waitFor(() => expect(commands.openSigaPortal).toHaveBeenCalledOnce())
    expect(commands.openOfflineShell).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('blocks opening while offline and enables access after reconnect', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<OfflineSchoolShell />)
    const button = screen.getByRole('button', { name: 'Abrir portal escolar' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(commands.openSigaPortal).not.toHaveBeenCalled()
    spy.mockReturnValue(true)
    fireEvent.online(window)
    expect(button).toBeEnabled()
    spy.mockRestore()
  })

  it('shows a recoverable error when native portal access fails', async () => {
    vi.mocked(commands.openSigaPortal).mockRejectedValueOnce(
      new Error('Falha da ligação')
    )
    render(<OfflineSchoolShell />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir portal escolar' })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O portal não pôde ser aberto'
    )
  })

  it('renders without Internet or privileged IPC requests', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<OfflineSchoolShell />)
    expect(screen.getByRole('status')).toHaveTextContent('Sem Internet')
    expect(screen.getByText(/Esta página abre localmente/)).toBeVisible()
    spy.mockRestore()
  })
})
