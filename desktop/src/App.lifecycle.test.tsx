import { StrictMode } from 'react'
import type { Menu } from '@tauri-apps/api/menu'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { commands } from './lib/tauri-bindings'
import { buildAppMenu, setupMenuLanguageListener } from './lib/menu'
import { initializeLanguage } from './i18n/language-init'

vi.mock('./components/layout/MainWindow', () => ({ MainWindow: () => null }))
vi.mock('./hooks/useSquareCornersEffect', () => ({
  useSquareCornersEffect: vi.fn(),
}))
vi.mock('./lib/commands', () => ({ initializeCommandSystem: vi.fn() }))
vi.mock('./lib/recovery', () => ({
  cleanupOldFiles: vi.fn().mockResolvedValue(0),
}))
vi.mock('./lib/menu', () => ({
  buildAppMenu: vi.fn().mockResolvedValue(undefined),
  setupMenuLanguageListener: vi.fn(),
}))
vi.mock('./i18n/language-init', () => ({
  initializeLanguage: vi.fn().mockResolvedValue(undefined),
}))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('App startup lifecycle', () => {
  const unsubscribe = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(setupMenuLanguageListener).mockReturnValue(unsubscribe)
  })

  afterEach(() => cleanup())

  it('removes the language listener on unmount', async () => {
    const { unmount } = render(<App />)
    await waitFor(() =>
      expect(setupMenuLanguageListener).toHaveBeenCalledOnce()
    )
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('does not install duplicate listeners under StrictMode', async () => {
    const { unmount } = render(
      <StrictMode>
        <App />
      </StrictMode>
    )
    await waitFor(() =>
      expect(setupMenuLanguageListener).toHaveBeenCalledOnce()
    )
    expect(buildAppMenu).toHaveBeenCalledOnce()
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('stops startup when unmounted during preference loading', async () => {
    const pending = deferred()
    vi.mocked(commands.loadPreferences).mockImplementationOnce(async () => {
      await pending.promise
      return { status: 'error', error: 'Preferences unavailable' }
    })
    const { unmount } = render(<App />)
    unmount()
    await act(async () => pending.resolve())
    expect(initializeLanguage).not.toHaveBeenCalled()
    expect(buildAppMenu).not.toHaveBeenCalled()
  })

  it('does not build a menu after unmount during language initialization', async () => {
    const pending = deferred()
    vi.mocked(initializeLanguage).mockReturnValueOnce(pending.promise)
    const { unmount } = render(<App />)
    await waitFor(() => expect(initializeLanguage).toHaveBeenCalledOnce())
    unmount()
    await act(async () => pending.resolve())
    expect(buildAppMenu).not.toHaveBeenCalled()
  })

  it('does not attach a listener after unmount during menu creation', async () => {
    const pending = deferred()
    vi.mocked(buildAppMenu).mockReturnValueOnce(
      pending.promise.then(() => ({}) as Menu)
    )
    const { unmount } = render(<App />)
    await waitFor(() => expect(buildAppMenu).toHaveBeenCalledOnce())
    unmount()
    await act(async () => pending.resolve())
    expect(setupMenuLanguageListener).not.toHaveBeenCalled()
  })
})
