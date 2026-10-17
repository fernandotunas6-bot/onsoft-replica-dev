import { describe, expect, it, vi } from 'vitest'
import { shortcutKeys } from './use-desktop-status'
import * as platform from './use-platform'

describe('shortcutKeys', () => {
  it('mostra os símbolos do Mac', () => {
    vi.spyOn(platform, 'getPlatform').mockReturnValue('macos')
    expect(shortcutKeys('CommandOrControl+Shift+.')).toEqual(['⌘', '⇧', '.'])
  })

  it('mostra Ctrl e Shift no Windows e no Linux', () => {
    vi.spyOn(platform, 'getPlatform').mockReturnValue('windows')
    expect(shortcutKeys('CommandOrControl+K')).toEqual(['Ctrl', 'K'])
    expect(shortcutKeys('Alt+Shift+KeyN')).toEqual(['Alt', 'Shift', 'N'])
  })
})
