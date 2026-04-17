interface SectionToolbarProps {
  visible?: boolean
  onComment?: () => void
}

export default function SectionToolbar({ visible, onComment }: SectionToolbarProps) {
  if (!visible) return null
  return (
    <button
      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      onClick={(e) => {
        e.stopPropagation()
        onComment?.()
      }}
      title="Comment"
    >
      Comment
    </button>
  )
}
