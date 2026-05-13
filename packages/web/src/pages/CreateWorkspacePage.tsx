import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.ts'

export default function CreateWorkspacePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [path, setPath] = useState('')

  const create = useMutation({
    mutationFn: api.createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      navigate('/workspace')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !path.trim()) return
    create.mutate({ name: name.trim(), path: path.trim() })
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Workspace</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            className="w-full border border-gray-300 bg-white text-gray-900 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Path</label>
          <input
            className="w-full border border-gray-300 bg-white text-gray-900 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="/path/to/project"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="px-4 py-2 rounded text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => navigate('/workspace')}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            disabled={!name.trim() || !path.trim() || create.isPending}
          >
            {create.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
