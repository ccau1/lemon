import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api.ts'
import { useEffect, useState } from 'react'

const LS_KEY = 'project_page_ticket_form'

type LsStore = Record<string, Record<string, { title: string; description: string }>>

function readLs(workspaceId: string, projectId: string): { title: string; description: string } {
  try {
    const store = JSON.parse(localStorage.getItem(LS_KEY) || '{}') as LsStore
    return store[workspaceId]?.[projectId] || { title: '', description: '' }
  } catch {
    return { title: '', description: '' }
  }
}

function writeLs(workspaceId: string, projectId: string, values: { title: string; description: string }) {
  try {
    const store = JSON.parse(localStorage.getItem(LS_KEY) || '{}') as LsStore
    if (!store[workspaceId]) store[workspaceId] = {}
    store[workspaceId][projectId] = values
    localStorage.setItem(LS_KEY, JSON.stringify(store))
  } catch {}
}

function clearLs(workspaceId: string, projectId: string) {
  try {
    const store = JSON.parse(localStorage.getItem(LS_KEY) || '{}') as LsStore
    if (store[workspaceId]) {
      delete store[workspaceId][projectId]
      localStorage.setItem(LS_KEY, JSON.stringify(store))
    }
  } catch {}
}

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams<{ workspaceId: string; projectId: string }>()
  const queryClient = useQueryClient()
  const { data: tickets } = useQuery({
    queryKey: ['tickets', workspaceId, projectId],
    queryFn: () => api.getTickets(workspaceId!, projectId),
    enabled: !!workspaceId && !!projectId,
  })

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  useEffect(() => {
    if (workspaceId && projectId) {
      const saved = readLs(workspaceId, projectId)
      setTitle(saved.title)
      setDescription(saved.description)
    }
  }, [workspaceId, projectId])

  useEffect(() => {
    if (workspaceId && projectId) {
      writeLs(workspaceId, projectId, { title, description })
    }
  }, [workspaceId, projectId, title, description])

  const createTicket = useMutation({
    mutationFn: (body: { projectId: string; title: string; description: string }) => api.createTicket(workspaceId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', workspaceId, projectId] })
      setTitle('')
      setDescription('')
      if (workspaceId && projectId) clearLs(workspaceId, projectId)
    },
  })

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Project Tickets</h1>
        <Link
          to={`/tickets?workspace=${workspaceId}&project=${projectId}`}
          className="bg-indigo-600 text-white px-4 py-2 rounded text-sm"
        >
          View in Board
        </Link>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6 space-y-3">
        <input
          className="border px-3 py-2 rounded w-full"
          placeholder="Ticket title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="border px-3 py-2 rounded w-full"
          placeholder="Ticket description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            className="bg-indigo-600 text-white px-4 py-2 rounded"
            onClick={() => createTicket.mutate({ projectId: projectId!, title, description })}
          >
            Add Ticket
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {(tickets || []).map((t: any) => (
          <li key={t.id}>
            <Link
              to={`/workspace/${workspaceId}/ticket/${t.id}`}
              className="bg-white p-4 rounded shadow flex justify-between items-center hover:bg-gray-50 block"
            >
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="text-xs text-gray-500 uppercase">{t.status.replace('_', ' ')}</div>
              </div>
              <span className="text-indigo-600 text-sm">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
