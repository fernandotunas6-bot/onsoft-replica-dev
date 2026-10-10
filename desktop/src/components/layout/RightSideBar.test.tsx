import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@/test/test-utils'
import { useUIStore } from '@/store/ui-store'
import { RightSideBar } from './RightSideBar'

describe('Nota rápida', () => {
  beforeEach(() => useUIStore.setState({ lastQuickPaneEntry: null }))

  it('edita a nota e limpa-a', () => {
    render(<RightSideBar />)
    const note = screen.getByRole('textbox')
    expect(screen.getByRole('button', { name: /limpar/i })).toBeDisabled()
    fireEvent.change(note, { target: { value: 'Ligar à secretaria' } })
    expect(useUIStore.getState().lastQuickPaneEntry).toBe('Ligar à secretaria')
    fireEvent.click(screen.getByRole('button', { name: /limpar/i }))
    expect(useUIStore.getState().lastQuickPaneEntry).toBe('')
  })
})
