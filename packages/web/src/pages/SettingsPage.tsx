import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.ts'
import { useState, useEffect, useRef } from 'react'
import { useParams, Link, Navigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ModelConfig, ActionMessage } from '@lemon/shared'
import { DropdownSelect } from '../components/Dropdown.tsx'
import ModelsTab from '../components/ModelsTab.tsx'
import IntegrationsTab from '../components/IntegrationsTab.tsx'
import PillToggle from '../components/common/PillToggle.tsx'

const steps = ['spec', 'plan', 'tasks', 'implement', 'done'] as const
const tabs = ['General', 'Workflow', 'Actions', 'Models', 'Integrations'] as const

function normalizeGlobs(raw: string[] | Record<string, string[]> | undefined): Record<string, string[]> {
  if (!raw) return { default: [] }
  if (Array.isArray(raw)) return { default: raw }
  return raw
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function XMarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function ActionSelector({
  available,
  selected,
  onChange,
  addLabel,
  searchPlaceholder,
  noActionsLabel,
  noMatchLabel,
}: {
  available: string[]
  selected: string[]
  onChange: (next: string[]) => void
  addLabel: string
  searchPlaceholder: string
  noActionsLabel: string
  noMatchLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = available.filter((a) => a.toLowerCase().includes(query.toLowerCase()))
  const unselected = available.filter((a) => !selected.includes(a))
  const canAdd = unselected.length > 0

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((action) => (
          <span
            key={action}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-indigo-50 text-indigo-700 border border-indigo-200"
          >
            {action}
            <button
              type="button"
              onClick={() => onChange(selected.filter((s) => s !== action))}
              className="hover:text-indigo-900"
              aria-label="Remove"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
          </span>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setQuery('')
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <PlusIcon className="w-3 h-3" />
            {addLabel}
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-10 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-2"
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {available.length === 0 && (
              <div className="text-xs text-gray-400 px-1 py-1">{noActionsLabel}</div>
            )}
            {available.length > 0 && filtered.length === 0 && (
              <div className="text-xs text-gray-400 px-1 py-1">{noMatchLabel}</div>
            )}
            {filtered.map((action) => {
              const isSelected = selected.includes(action)
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => {
                    const next = isSelected
                      ? selected.filter((s) => s !== action)
                      : [...selected, action]
                    onChange(next)
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between ${
                    isSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate">{action}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex justify-end pt-2 border-t mt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function RoleAvatar({
  role,
  onChange,
}: {
  role: ActionMessage['role']
  onChange: (role: ActionMessage['role']) => void
}) {
  const roles: { value: ActionMessage['role']; label: string; title: string; classes: string }[] = [
    { value: 'system', label: 'S', title: 'System', classes: 'bg-gray-200 text-gray-700 hover:bg-gray-300' },
    { value: 'user', label: 'U', title: 'User', classes: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
    { value: 'assistant', label: 'A', title: 'Assistant', classes: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
  ]
  const current = roles.find((r) => r.value === role) || roles[0]

  return (
    <div className="relative group/avatar">
      <button
        type="button"
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${current.classes}`}
      >
        {current.label}
      </button>
      <div className="absolute top-10 left-1/2 -translate-x-1/2 hidden group-hover/avatar:flex flex-col pt-2 z-10">
        <div className="bg-white border rounded-lg shadow-lg p-1 flex">
          {roles.map((r) => (
            <div key={r.value} className="relative group/opt flex flex-col items-center m-0.5">
              <button
                type="button"
                onClick={() => onChange(r.value)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${r.classes}`}
              >
                {r.label}
              </button>
              <span className="absolute top-full mt-1 hidden group-hover/opt:block text-[10px] text-gray-600 whitespace-nowrap bg-white border rounded px-1.5 py-0.5 shadow-sm z-20">
                {r.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionCard({
  name,
  messages,
  onRename,
  onRemove,
  onChangeMessages,
}: {
  name: string
  messages: ActionMessage[]
  onRename: (oldName: string, newName: string) => void
  onRemove: (name: string) => void
  onChangeMessages: (name: string, messages: ActionMessage[]) => void
}) {
  const [draftName, setDraftName] = useState(name)

  useEffect(() => {
    setDraftName(name)
  }, [name])

  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <input
          className="bg-gray-100 border-0 rounded-lg px-3 py-2 flex-1 text-lg font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          value={draftName}
          placeholder="Action name"
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => {
            const trimmed = draftName.trim()
            if (trimmed && trimmed !== name) {
              onRename(name, trimmed)
            } else if (!trimmed) {
              setDraftName(name)
            }
          }}
        />
        <button
          type="button"
          className="text-red-500 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
          title="Remove action"
          onClick={() => onRemove(name)}
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className="flex gap-3 items-start group">
            <RoleAvatar
              role={msg.role}
              onChange={(role) => {
                const next = [...messages]
                next[idx] = { ...msg, role }
                onChangeMessages(name, next)
              }}
            />
            <div className="flex-1 relative">
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 relative">
                <textarea
                  className="w-full bg-transparent text-sm resize-y focus:outline-none min-h-[4.5rem]"
                  placeholder="Message content"
                  value={msg.content}
                  onChange={(e) => {
                    const next = [...messages]
                    next[idx] = { ...msg, content: e.target.value }
                    onChangeMessages(name, next)
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              className="text-red-500 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 mt-1"
              title="Remove message"
              onClick={() => {
                const next = messages.filter((_, i) => i !== idx)
                onChangeMessages(name, next)
              }}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-indigo-600 text-sm font-medium hover:text-indigo-700 transition-colors pt-1"
          onClick={() => onChangeMessages(name, [...messages, { role: 'user', content: '' }])}
        >
          <PlusIcon className="w-4 h-4" />
          Add message
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { tab } = useParams<{ tab?: string }>()
  const activeTab = tabs.find((t) => t.toLowerCase() === tab?.toLowerCase()) || null
  if (!activeTab) return <Navigate to="/settings/general" replace />
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: () => api.getConfig() })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: api.getModels })
  const { data: themesData } = useQuery({ queryKey: ['themes'], queryFn: api.getThemes })
  const { data: configDefaults } = useQuery({ queryKey: ['configDefaults'], queryFn: api.getConfigDefaults })
  const { data: serverInfo } = useQuery({ queryKey: ['serverInfo'], queryFn: api.getServerInfo })

  const [autoApprove, setAutoApprove] = useState<Record<string, boolean>>({})
  const [concurrency, setConcurrency] = useState(3)
  const [globs, setGlobs] = useState<Record<string, string>>({})
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({})
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [searchParams, setSearchParams] = useSearchParams()
  const stepParam = searchParams.get('step')
  const initialStep = steps.includes(stepParam as any) ? stepParam! : steps[0]
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<string>(initialStep)

  const setWorkflowStep = (step: string) => {
    setActiveWorkflowStep(step)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', step)
      return next
    }, { replace: true })
  }
  const [triggers, setTriggers] = useState<Record<string, string[]>>({})
  const [actions, _setActions] = useState<Record<string, ActionMessage[]>>({})
  const actionsDirty = useRef(false)
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  const [dataDir, setDataDir] = useState('~/.lemon')
  const [dataDirSaved, setDataDirSaved] = useState(false)

  const setActions = (next: Record<string, ActionMessage[]>) => {
    actionsDirty.current = true
    _setActions(next)
  }

  useEffect(() => {
    if (config) {
      setAutoApprove(config.autoApprove || {})
      setConcurrency(config.parallelConcurrency || 3)
      setDefaultModels(config.defaultModels || {})
      const initPrompts: Record<string, string> = {}
      steps.filter((s) => s !== 'done').forEach((step) => {
        initPrompts[step] = (config.prompts as Record<string, string>)?.[step] || configDefaults?.prompts?.[step] || ''
      })
      setPrompts(initPrompts)
      setTriggers(config.triggers || {})
      setActions(config.actions || {})
      actionsDirty.current = false
      const normalized = normalizeGlobs(config.contextGlobs)
      const entries: Record<string, string> = {}
      for (const key of ['default', ...steps]) {
        entries[key] = (normalized[key] || []).join('\n')
      }
      setGlobs(entries)
    }
  }, [config, configDefaults])

  useEffect(() => {
    if (serverInfo) {
      setDataDir(serverInfo.dataDir)
      setDataDirSaved(false)
    }
  }, [serverInfo])

  // Debounced auto-save for actions
  useEffect(() => {
    if (!actionsDirty.current) return
    const t = setTimeout(() => {
      api.setConfig({ key: 'actions', value: actionsRef.current }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['config'] })
      })
      actionsDirty.current = false
    }, 600)
    return () => clearTimeout(t)
  }, [actions, queryClient])

  // Save on unmount
  useEffect(() => {
    return () => {
      if (actionsDirty.current) {
        api.setConfig({ key: 'actions', value: actionsRef.current })
      }
    }
  }, [])

  const update = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) => api.setConfig({ key, value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })

  const setDefaultModel = useMutation({
    mutationFn: ({ step, modelId }: { step: string; modelId: string }) => api.setDefaultModel({ step, modelId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })

  const setDataDirMutation = useMutation({
    mutationFn: (dir: string) => api.setDataDir(dir),
    onSuccess: () => {
      setDataDirSaved(true)
      queryClient.invalidateQueries({ queryKey: ['serverInfo'] })
    },
    onError: (err: any) => {
      alert(err?.message || 'Failed to save data directory')
    },
  })

  const handleDefaultModelChange = (step: string, modelId: string) => {
    const next = { ...defaultModels, [step]: modelId }
    setDefaultModels(next)
    setDefaultModel.mutate({ step, modelId })
  }

  const handleRenameAction = (oldName: string, newName: string) => {
    const msgs = actions[oldName]
    const { [oldName]: _, ...rest } = actions
    setActions({ ...rest, [newName]: msgs })
  }

  const handleRemoveAction = (name: string) => {
    if (!confirm(`Remove action "${name}"?`)) return
    const { [name]: _, ...rest } = actions
    setActions(rest)
  }

  const handleChangeMessages = (name: string, messages: ActionMessage[]) => {
    setActions({ ...actions, [name]: messages })
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <div className="flex flex-col md:flex-row gap-6">
        {/* Tabs - left side */}
        <aside className="md:w-48 shrink-0 sticky top-6 self-start">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {tabs.map((t) => (
              <Link
                key={t}
                to={`/settings/${t.toLowerCase()}`}
                className={`text-left px-4 py-2 rounded text-sm whitespace-nowrap ${
                  activeTab === t
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 pr-2 pb-10">
          {activeTab === 'General' && (
            <div className="space-y-6">
              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold mb-3">Theme</h2>
                <div className="flex items-center gap-3">
                  <DropdownSelect
                    className="flex-1"
                    placeholder="Select theme..."
                    options={(() => {
                      const builtIns = (themesData?.themes || []).filter((t: any) => t.builtIn)
                      const customs = (themesData?.themes || []).filter((t: any) => !t.builtIn)
                      return [
                        { value: '__builtins__', label: 'Built-in', disabled: true },
                        ...builtIns.map((t: any) => ({ value: t.id, label: t.name })),
                        ...(customs.length > 0 ? [
                          { value: '__custom_themes__', label: 'Custom themes', disabled: true } as const,
                          ...customs.map((t: any) => ({ value: t.id, label: t.name })),
                        ] : []),
                        { value: '__sep__', label: '─────────', disabled: true },
                        { value: 'custom', label: 'Custom file...' },
                      ]
                    })()}
                    value={config?.theme || 'dark'}
                    onChange={(themeId) => {
                      if (themeId) {
                        api.setTheme(themeId).then(() => {
                          queryClient.invalidateQueries({ queryKey: ['config'] })
                        })
                      }
                    }}
                  />
                </div>
                {(config?.theme || 'dark') === 'custom' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Custom CSS file</label>
                    <input
                      type="file"
                      accept=".css"
                      className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          const css = String(reader.result)
                          let style = document.getElementById('custom-theme') as HTMLStyleElement | null
                          if (!style) {
                            style = document.createElement('style')
                            style.id = 'custom-theme'
                            document.head.appendChild(style)
                          }
                          style.textContent = css
                        }
                        reader.readAsText(file)
                      }}
                    />
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Choose a built-in theme, a theme from ~/.lemon/styles/, or pick Custom file to load a local CSS directly.
                </p>
              </div>

              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold mb-3">Data Directory</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="border px-3 py-2 rounded w-full text-sm font-mono bg-white text-gray-900"
                      value={dataDir}
                      onChange={(e) => {
                        setDataDir(e.target.value)
                        setDataDirSaved(false)
                      }}
                    />
                    {typeof window !== 'undefined' && window.electronAPI && (
                      <button
                        type="button"
                        className="px-3 py-2 rounded bg-gray-100 text-sm hover:bg-gray-200"
                        onClick={async () => {
                          const dir = await window.electronAPI!.selectFolder()
                          if (dir) {
                            setDataDir(dir)
                            setDataDirSaved(false)
                          }
                        }}
                      >
                        Browse
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
                      disabled={!dataDir.trim() || setDataDirMutation.isPending}
                      onClick={() => setDataDirMutation.mutate(dataDir)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 rounded bg-gray-100 text-sm hover:bg-gray-200"
                      onClick={() => {
                        setDataDir('~/.lemon')
                        setDataDirSaved(false)
                      }}
                    >
                      Reset to default
                    </button>
                  </div>
                  {dataDirSaved && (
                    <p className="text-sm text-amber-600 font-medium">
                      Restart required for changes to take effect.
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    Directory for global config, models, integrations, and workspace databases.
                    Defaults to ~/.lemon.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Workflow' && (
            <div className="space-y-6">
              <div className="text-sm font-semibold text-gray-900">Step Config</div>

              <div className="bg-white p-4 rounded shadow">
                <div className="flex items-center gap-2 border-b pb-3 mb-4 overflow-x-auto">
                  {steps.map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setWorkflowStep(step)}
                      className={`px-3 py-1.5 rounded text-sm capitalize whitespace-nowrap transition-colors ${
                        activeWorkflowStep === step
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {step}
                    </button>
                  ))}
                </div>
                {(() => {
                  const step = activeWorkflowStep
                  const val = autoApprove[step] || false
                  return (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="flex-1 space-y-1">
                          <label className="text-sm font-medium text-gray-700 h-6 flex items-center">Model</label>
                          <p className="text-xs text-gray-500">{t('workflow.modelDescription')}</p>
                          <DropdownSelect
                            className="w-full"
                            placeholder="— None —"
                            options={(models || []).map((m: ModelConfig) => ({ value: m.id, label: m.name }))}
                            value={defaultModels[step] || ''}
                            onChange={(modelId) => handleDefaultModelChange(step, modelId)}
                          />
                        </div>
                        <div
                          className="space-y-1 sm:px-2 rounded sm:hover:bg-gray-50 cursor-pointer"
                          onClick={() => {
                            const checked = !val
                            const next = { ...autoApprove, [step]: checked }
                            setAutoApprove(next)
                            update.mutate({ key: `autoApprove.${step}`, value: checked })
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-700 select-none">Auto-approve</span>
                            <span className="mb-[-0.3125rem]" onClick={(e) => e.stopPropagation()}>
                              <PillToggle
                                value={val}
                                onChange={(checked) => {
                                  const next = { ...autoApprove, [step]: checked }
                                  setAutoApprove(next)
                                  update.mutate({ key: `autoApprove.${step}`, value: checked })
                                }}
                              />
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">{t('workflow.autoApproveDescription')}</p>
                        </div>
                      </div>

                      {step !== 'done' && (
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-gray-700">Prompt</label>
                          <p className="text-xs text-gray-500">{t('workflow.promptDescription')}</p>
                          <textarea
                            className="border px-3 py-2 rounded w-full h-32 font-mono text-sm bg-white text-gray-900"
                            value={prompts[step] || ''}
                            onChange={(e) => setPrompts({ ...prompts, [step]: e.target.value })}
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Context globs</label>
                        <p className="text-xs text-gray-500">{t('workflow.contextGlobsDescription')}</p>
                        <textarea
                          className="border px-3 py-2 rounded w-full h-24 font-mono text-sm bg-white text-gray-900"
                          value={globs[step] || ''}
                          onChange={(e) => setGlobs({ ...globs, [step]: e.target.value })}
                        />
                      </div>

                      {step === 'done' && (
                        <div className="space-y-3 pt-2 border-t">
                          <label className="text-sm font-medium text-gray-700">Triggers</label>
                          <p className="text-xs text-gray-500">{t('workflow.triggersDescription')}</p>
                          {['preRunDone', 'postRunDone'].map((event) => (
                            <div key={event} className="border rounded-lg p-3">
                              <div className="text-sm font-medium text-gray-800 mb-2">{t(`event.${event}`)}</div>
                              <ActionSelector
                                available={Object.keys(actions)}
                                selected={triggers[event] || []}
                                onChange={(next) => {
                                  const nextTriggers = { ...triggers, [event]: next }
                                  setTriggers(nextTriggers)
                                  update.mutate({ key: 'triggers', value: nextTriggers })
                                }}
                                addLabel={t('workflow.addAction')}
                                searchPlaceholder={t('workflow.searchActions')}
                                noActionsLabel={t('workflow.noActionsDefined')}
                                noMatchLabel={t('workflow.noActionsMatch')}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              <hr className="border-gray-200" />

              <div className="text-sm font-semibold text-gray-900">Global Workflow Settings</div>

              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold mb-1">Default Models</h2>
                <p className="text-xs text-gray-500 mb-3">{t('workflow.defaultModelsDescription')}</p>
                <div className="flex items-center gap-2 mb-4">
                  <DropdownSelect
                    className="w-auto"
                    placeholder="Set all steps to..."
                    options={(models || []).map((m: ModelConfig) => ({ value: m.id, label: m.name }))}
                    value=""
                    onChange={(modelId) => {
                      if (modelId) {
                        const next: Record<string, string> = {}
                        for (const step of steps) {
                          next[step] = modelId
                          setDefaultModel.mutate({ step, modelId })
                        }
                        setDefaultModels({ ...defaultModels, ...next })
                      }
                    }}
                  />
                </div>
              </div>

              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold mb-1">Default Context Globs</h2>
                <p className="text-xs text-gray-500 mb-3">{t('workflow.defaultContextGlobsDescription')}</p>
                <textarea
                  className="border px-3 py-2 rounded w-full h-24 font-mono text-sm bg-white text-gray-900"
                  value={globs.default || ''}
                  onChange={(e) => setGlobs({ ...globs, default: e.target.value })}
                />
              </div>

              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold mb-1">Parallel Concurrency</h2>
                <p className="text-xs text-gray-500 mb-3">{t('workflow.parallelConcurrencyDescription')}</p>
                <input
                  type="number"
                  className="border px-3 py-2 rounded w-32 bg-white text-gray-900"
                  value={concurrency}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setConcurrency(val)
                    update.mutate({ key: 'parallelConcurrency', value: val })
                  }}
                />
              </div>

              <button
                className="bg-indigo-600 text-white px-4 py-2 rounded"
                onClick={() => {
                  const toSave: Record<string, string> = {}
                  steps.filter((s) => s !== 'done').forEach((step) => {
                    const val = prompts[step]?.trim()
                    const def = configDefaults?.prompts?.[step] || ''
                    if (val && val !== def) {
                      toSave[step] = val
                    }
                  })
                  update.mutate({ key: 'prompts', value: toSave })
                  const record: Record<string, string[]> = {}
                  for (const key of ['default', ...steps]) {
                    const arr = globs[key]?.split('\n').map((s) => s.trim()).filter((s) => s.length > 0) || []
                    if (arr.length > 0) {
                      record[key] = arr
                    }
                  }
                  update.mutate({ key: 'contextGlobs', value: record })
                }}
              >
                Save Workflow
              </button>

            </div>
          )}



          {activeTab === 'Actions' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Actions</h2>
                <p className="text-sm text-gray-500">
                  Named prompt sequences that can be triggered manually or from workflows.
                  Prefix with <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">workspaceName/</code> to scope an action to a specific workspace.
                </p>
              </div>
              <div className="space-y-5">
                {Object.entries(actions).map(([name, messages]) => (
                  <ActionCard
                    key={name}
                    name={name}
                    messages={messages}
                    onRename={handleRenameAction}
                    onRemove={handleRemoveAction}
                    onChangeMessages={handleChangeMessages}
                  />
                ))}
              </div>
              <div>
                <button
                  className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  onClick={() => {
                    const newName = `action_${Object.keys(actions).length + 1}`
                    setActions({ ...actions, [newName]: [{ role: 'user', content: '' }] })
                  }}
                >
                  <PlusIcon className="w-4 h-4" />
                  Add action
                </button>
              </div>
            </div>
          )}

          {activeTab === 'Models' && <ModelsTab />}

          {activeTab === 'Integrations' && <IntegrationsTab />}
        </div>
      </div>
    </div>
  )
}
