import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfflineSchoolShell } from './OfflineSchoolShell'

describe('SIGA offline school shell', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders bundled UI without claiming that school data are available', () => {
    render(<OfflineSchoolShell />)
    expect(screen.getByRole('heading', { name: 'Base escolar local' })).toBeVisible()
    expect(screen.getByText(/Ainda indisponíveis/)).toBeVisible()
    expect(screen.getByText(/sem dados escolares/i)).toBeVisible()
  })

  it('renders without Internet or privileged IPC requests', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<OfflineSchoolShell />)
    expect(screen.getByRole('status')).toHaveTextContent('Sem Internet')
    expect(screen.getByText(/Esta página abre localmente/)).toBeVisible()
    spy.mockRestore()
  })
})
