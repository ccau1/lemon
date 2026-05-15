import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api.ts'
import { useState } from 'react'

export default function WorkspacesPage() {
  const queryClient = useQueryClient()
  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.getWorkspaces,
  })

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')

  const create = useMutation({
    mutationFn: api.createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setName('')
      setPath('')
      setOpen(false)
    },
  })

  const deleteWorkspace = useMutation({
    mutationFn: api.deleteWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <button
          className="bg-indigo-600 text-white px-4 py-2 rounded text-sm"
          onClick={() => setOpen(true)}
        >
          Create
        </button>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <ul className="space-y-2">
          {(workspaces || []).map((w: any) => (
            <li key={w.id}>
              <div className="bg-white p-4 rounded shadow flex justify-between items-center hover:bg-gray-50 group">
                <Link
                  to={`/workspace/${w.id}`}
                  className="flex-1 min-w-0"
                >
                  <div className="font-semibold">{w.name}</div>
                  <div className="text-sm text-gray-500 truncate">{w.path}</div>
                </Link>
                <div className="flex items-center gap-2 ml-4">
                  <Link
                    to={`/workspace/${w.id}`}
                    className="text-indigo-600 text-sm"
                  >
                    Open →
                  </Link>
                  <button
                    className="text-gray-400 hover:text-red-600 p-1 rounded"
                    title="Delete workspace"
                    onClick={() => {
                      if (window.confirm(`Delete workspace "${w.name}"? This removes Lemon's tracking files but leaves the repo's .lemon folder intact.`)) {
                        deleteWorkspace.mutate(w.id)
                      }
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Create Workspace</h2>
              <button
                className="text-gray-500 hover:text-gray-800"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  className="border border-gray-300 bg-white text-gray-900 px-3 py-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Workspace name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Path</label>
                <input
                  className="border border-gray-300 bg-white text-gray-900 px-3 py-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="/path/to/project"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                className="px-4 py-2 rounded text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="bg-indigo-600 text-white px-4 py-2 rounded text-sm"
                onClick={() => create.mutate({ name, path })}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
