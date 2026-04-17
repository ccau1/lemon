import type { WorkflowStep } from '@lemon/shared'

function stepIndex(step: WorkflowStep | 'workflow') {
  return (['spec', 'plan', 'tasks'] as WorkflowStep[]).indexOf(step as WorkflowStep)
}

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  }
}

function describeArc(x: number, y: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, r, endAngle)
  const end = polarToCartesian(x, y, r, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ')
}

function TaskProgressIcon({ tasks }: { tasks: any[] }) {
  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'done' || t.done).length
  const gap = 2 // degrees
  const usableAngle = 180 - gap * 2
  const internalGaps = Math.max(0, total - 1)
  const segmentAngle = total > 0 ? (usableAngle - internalGaps * gap) / total : 0
  const segments = []
  for (let i = 0; i < total; i++) {
    const start = gap + i * (segmentAngle + gap)
    const end = start + segmentAngle
    segments.push({ start, end, done: i < completed })
  }
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path
        d={describeArc(12, 12, 10, 180, 360)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-indigo-600"
      />
      {segments.map((s, i) => (
        <path
          key={i}
          d={describeArc(12, 12, 10, s.start, s.end)}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className={s.done ? 'text-indigo-600' : 'text-gray-300'}
        />
      ))}
    </svg>
  )
}

function TaskHalfCircleIcon({ colorClass }: { colorClass: string }) {
  return (
    <svg className={`w-4 h-4 ${colorClass}`} fill="none" viewBox="0 0 24 24">
      <path
        d={describeArc(12, 12, 10, 180, 360)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
    </svg>
  )
}

export function StatusIcon({ status, step, effectiveStep, outdated, isRunning, tasks }: { status: string; step: WorkflowStep | 'workflow'; effectiveStep: WorkflowStep; outdated?: boolean; isRunning?: boolean; tasks?: any[] }) {
  const idx = stepIndex(step)
  const effIdx = stepIndex(effectiveStep)
  const isError = status === 'error' && step === effectiveStep
  const isPendingReview = status === 'awaiting_review' && step === effectiveStep
  const isCurrent = idx === effIdx && status !== 'done'
  const isDone = idx < effIdx || status === 'done'
  const isProcessing = step === effectiveStep && (isRunning || (status !== 'awaiting_review' && status !== 'error' && status !== 'done'))

  if (step === 'workflow') {
    return (
      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }
  if (outdated) {
    return (
      <svg className="w-4 h-4 text-orange-900" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }
  if (step === 'tasks' && tasks && tasks.length > 0) {
    if (status === 'implement') {
      return <TaskProgressIcon tasks={tasks} />
    }
    if (isDone) {
      return (
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    }
    if (isError) {
      return (
        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
    if (isProcessing) {
      return (
        <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )
    }
    return <TaskHalfCircleIcon colorClass={isPendingReview ? 'text-orange-500' : isCurrent ? 'text-indigo-600' : 'text-gray-400'} />
  }
  if (isProcessing) {
    return (
      <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    )
  }
  if (isError) {
    return (
      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
  if (isDone) {
    return (
      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (isPendingReview) {
    return (
      <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }
  if (isCurrent) {
    return (
      <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
    </svg>
  )
}

export function ExpandIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function TaskStatusIcon({ status }: { status?: string }) {
  switch (status) {
    case 'processing':
      return (
        <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )
    case 'done':
      return (
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    case 'error':
      return (
        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )
    case 'cancelled':
      return (
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      )
    case 'queued':
    default:
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
        </svg>
      )
  }
}

export function TaskStatusBadge({ status }: { status?: string }) {
  const classes = "text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide font-medium"
  switch (status) {
    case 'processing':
      return <span className={`${classes} bg-indigo-100 text-indigo-800`}>Processing</span>
    case 'done':
      return <span className={`${classes} bg-green-100 text-green-800`}>Done</span>
    case 'error':
      return <span className={`${classes} bg-red-100 text-red-800`}>Error</span>
    case 'cancelled':
      return <span className={`${classes} bg-gray-200 text-gray-700`}>Cancelled</span>
    case 'queued':
    default:
      return <span className={`${classes} bg-gray-100 text-gray-600`}>Queued</span>
  }
}
