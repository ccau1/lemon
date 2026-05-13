import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'
import TicketsBoardPage from './TicketsBoardPage.tsx'

vi.mock('../api.ts', () => ({
  api: {
    getWorkspaces: () => Promise.resolve([{ id: 'ws1', name: 'Workspace 1' }]),
    getAllTickets: () =>
      Promise.resolve([
        {
          id: 't1',
          projectId: 'p1',
          projectName: 'Alpha',
          title: 'Ticket 1',
          status: 'spec',
          effectiveStep: 'spec',
          workspaceId: 'ws1',
          workspaceName: 'Workspace 1',
          createdAt: new Date().toISOString(),
        },
        {
          id: 't2',
          projectId: 'p2',
          projectName: 'Beta',
          title: 'Ticket 2',
          status: 'spec',
          effectiveStep: 'spec',
          workspaceId: 'ws1',
          workspaceName: 'Workspace 1',
          createdAt: new Date().toISOString(),
        },
      ]),
  },
}))

vi.mock('../WorkspaceContext.tsx', () => ({
  useSelectedWorkspace: () => ({ selectedWorkspaceId: 'all' }),
}))

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.search}</div>
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

describe('TicketsBoardPage project filter', () => {
  it('updates URL when toggling a project', async () => {
    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <QueryClientProvider client={queryClient}>
          <TicketsBoardPage />
          <LocationDisplay />
        </QueryClientProvider>
      </MemoryRouter>
    )

    // Wait for tickets to load and dropdown to appear
    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeTruthy()
    })

    // Open the Projects dropdown
    fireEvent.click(screen.getByText('Projects'))

    // Click the first project checkbox
    const checkbox = screen.getByLabelText('Alpha')
    fireEvent.click(checkbox)

    // Assert URL updated
    await waitFor(() => {
      const loc = screen.getByTestId('location').textContent
      expect(loc).toContain('project=p1')
    })
  })
})
