// Task 12 — Component tests for the ChatInput agent chat input
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the store module
vi.mock('../../store', () => ({
    useAgentStore: vi.fn(),
}))

import { ChatInput } from '../../components/agent/ChatInput'
import { useAgentStore } from '../../store'

const mockSendMessage = vi.fn()

function setupStore(overrides: Partial<{ isLoading: boolean; sendMessage: typeof mockSendMessage }> = {}) {
    vi.mocked(useAgentStore).mockReturnValue({
        isLoading: false,
        sendMessage: mockSendMessage,
        context: {},
        ...overrides,
    } as ReturnType<typeof useAgentStore>)
}

describe('ChatInput', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders a textarea', () => {
        setupStore()
        render(<ChatInput />)
        expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('Enter key submits the message', async () => {
        setupStore()
        mockSendMessage.mockResolvedValueOnce(undefined)
        render(<ChatInput />)
        const textarea = screen.getByRole('textbox')
        await userEvent.type(textarea, 'Hello Atlas')
        await userEvent.keyboard('{Enter}')
        expect(mockSendMessage).toHaveBeenCalledWith('Hello Atlas')
    })

    it('Shift+Enter does not submit', async () => {
        setupStore()
        render(<ChatInput />)
        const textarea = screen.getByRole('textbox')
        await userEvent.type(textarea, 'Hello')
        await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
        expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('textarea is disabled when isLoading is true', () => {
        setupStore({ isLoading: true })
        render(<ChatInput />)
        expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('does not submit empty message', async () => {
        setupStore()
        render(<ChatInput />)
        await userEvent.keyboard('{Enter}')
        expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('renders send button', () => {
        setupStore()
        render(<ChatInput />)
        expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
    })
})
