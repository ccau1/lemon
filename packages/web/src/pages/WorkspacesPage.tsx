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
              <Link
                to={`/workspace/${w.id}`}
                className="bg-white p-4 rounded shadow flex justify-between items-center hover:bg-gray-50"
              >
                <div>
                  <div className="font-semibold">{w.name}</div>
                  <div className="text-sm text-gray-500">{w.path}</div>
                </div>
                <span className="text-indigo-600 text-sm">Open →</span>
              </Link>
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
                  className="border px-3 py-2 rounded w-full"
                  placeholder="Workspace name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Path</label>
                <input
                  className="border px-3 py-2 rounded w-full"
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
