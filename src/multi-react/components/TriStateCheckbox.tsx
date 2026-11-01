type TriStateCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  className?: string;
  onCheckedChange?: (checked: boolean) => void;
};

/**
 * Checkbox supporting the checked / unchecked / indeterminate states.
 * Stops click/change propagation so it can sit inside clickable rows.
 */
export function TriStateCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  className = 'shrink-0 accent-blue-500',
  onCheckedChange,
}: TriStateCheckboxProps) {
  return (
    <input
      type="checkbox"
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      className={className}
      checked={checked}
      disabled={disabled}
      onChange={(e) => {
        e.stopPropagation();
        onCheckedChange?.(e.target.checked);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
