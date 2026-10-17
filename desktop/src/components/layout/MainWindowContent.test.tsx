import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@/test/test-utils'
import { commands } from '@/lib/tauri-bindings'
import { MainWindowContent } from './MainWindowContent'

describe('SIGA desktop actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the local screen usable when opening the school fails', async () => {
    vi.mocked(commands.openSigaPortal).mockRejectedValueOnce(
      new Error('Sem ligação')
    )
    render(<MainWindowContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir SIGA Plus' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Sem ligação')
    )
    expect(
      screen.getByRole('button', { name: 'Abrir SIGA Plus' })
    ).toBeEnabled()
    expect(screen.getByRole('heading')).toBeVisible()
  })

  it('disables opening while the native window is being created', async () => {
    let complete!: (value: { status: 'ok'; data: null }) => void
    vi.mocked(commands.openSigaPortal).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve
        })
    )
    render(<MainWindowContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir SIGA Plus' }))
    expect(screen.getByRole('button', { name: /a abrir/i })).toBeDisabled()
    complete({ status: 'ok', data: null })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Abrir SIGA Plus' })
      ).toBeEnabled()
    )
  })

  it('does not report an unsigned installation as up to date', async () => {
    render(<MainWindowContent />)
    fireEvent.click(
      screen.getByRole('button', { name: /verificar actualiza/i })
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/configurad/i)
    )
    expect(commands.desktopUpdateStatus).toHaveBeenCalledOnce()
  })
})
