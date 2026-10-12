import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PAGE_SETUP, PageSetupDialog } from '../src/components/PageSetupDialog'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Page Setup dialog', () => {
  it('keeps heading page breaks off by default and exposes an explicit toggle', async () => {
    expect(DEFAULT_PAGE_SETUP.breakBeforeH1).toBe(false)

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onChange = vi.fn()
    await act(async () => {
      root.render(createElement(PageSetupDialog, {
        visible: true,
        value: DEFAULT_PAGE_SETUP,
        onChange,
        onClose: () => undefined
      }))
    })

    const toggle = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .find((input) => input.parentElement?.textContent?.includes('Start top-level headings'))
    if (!toggle) throw new Error('Heading page-break toggle not found')
    expect(toggle.checked).toBe(false)
    await act(async () => toggle.click())
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_PAGE_SETUP, breakBeforeH1: true })

    await act(async () => root.unmount())
    host.remove()
  })
})
