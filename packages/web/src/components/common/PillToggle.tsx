export interface PillToggleProps {
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  title?: string
}

export default function PillToggle({ value, onChange, disabled, title }: PillToggleProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-[3.25rem] items-center rounded-full transition-colors focus:outline-none ${
        value ? 'bg-green-400' : 'bg-gray-400'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-[1.625rem]' : 'translate-x-0'
        }`}
      />
      <span className={`absolute text-[10px] font-bold text-white ${value ? 'left-1.5' : 'right-1.5'}`}>
        {value ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}
