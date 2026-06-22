'use client'

import * as React from 'react'
import { CaretDownIcon, CheckIcon, XIcon } from '@phosphor-icons/react'

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from 'src/components/ui/input-group'
import { cn } from 'src/lib/utils'

export type ComboboxOption = {
  label: React.ReactNode
  value: string
}

type ComboboxContextValue<TItem extends ComboboxOption> = {
  disabled?: boolean
  filteredItems: TItem[]
  open: boolean
  query: string
  required?: boolean
  selectedItem?: TItem
  selectedValue: string
  clear: () => void
  selectItem: (item: TItem) => void
  setOpen: (open: boolean) => void
  setQuery: (query: string) => void
}

const ComboboxContext = React.createContext<ComboboxContextValue<ComboboxOption> | undefined>(undefined)

function getOptionText(option: ComboboxOption | undefined) {
  if (!option) return ''
  if (typeof option.label === 'string' || typeof option.label === 'number') {
    return String(option.label)
  }
  return option.value
}

function useComboboxContext() {
  const context = React.useContext(ComboboxContext)
  if (!context) {
    throw new Error('Combobox components must be rendered inside Combobox')
  }
  return context
}

function Combobox<TItem extends ComboboxOption = ComboboxOption>({
  className,
  children,
  defaultValue = '',
  disabled,
  items = [],
  name,
  onValueChange,
  required,
  value,
  ...props
}: Omit<React.ComponentProps<'div'>, 'defaultValue' | 'onChange'> & {
  defaultValue?: string
  disabled?: boolean
  items?: readonly TItem[]
  name?: string
  onValueChange?: (value: string, item: TItem | undefined) => void
  required?: boolean
  value?: string
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const [open, setOpen] = React.useState(false)
  const selectedValue = value ?? internalValue
  const selectedItem = items.find((item) => item.value === selectedValue)
  const [query, setQuery] = React.useState(getOptionText(selectedItem) || selectedValue)

  React.useEffect(() => {
    setQuery(getOptionText(selectedItem) || selectedValue)
  }, [selectedItem, selectedValue])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredItems = normalizedQuery
    ? items.filter((item) => `${getOptionText(item)} ${item.value}`.toLowerCase().includes(normalizedQuery))
    : [...items]

  function selectItem(item: TItem) {
    if (value === undefined) {
      setInternalValue(item.value)
    }
    setQuery(getOptionText(item))
    setOpen(false)
    onValueChange?.(item.value, item)
  }

  function clear() {
    if (value === undefined) {
      setInternalValue('')
    }
    setQuery('')
    onValueChange?.('', undefined)
  }

  const context = React.useMemo<ComboboxContextValue<ComboboxOption>>(
    () => ({
      disabled,
      filteredItems,
      open,
      query,
      required,
      selectedItem,
      selectedValue,
      clear,
      selectItem: selectItem as (item: ComboboxOption) => void,
      setOpen,
      setQuery
    }),
    [disabled, filteredItems, open, query, required, selectedItem, selectedValue]
  )

  return (
    <ComboboxContext.Provider value={context}>
      <div
        data-slot='combobox'
        className={cn('relative', className)}
        {...props}
      >
        {name ? (
          <input
            type='hidden'
            name={name}
            value={selectedValue}
          />
        ) : null}
        {children}
      </div>
    </ComboboxContext.Provider>
  )
}

function ComboboxValue({ className, ...props }: React.ComponentProps<'span'>) {
  const context = useComboboxContext()

  return (
    <span
      data-slot='combobox-value'
      className={cn(className)}
      {...props}
    >
      {context.selectedItem?.label ?? context.selectedValue}
    </span>
  )
}

function ComboboxTrigger({ className, children, ...props }: React.ComponentProps<typeof InputGroupButton>) {
  const context = useComboboxContext()

  return (
    <InputGroupButton
      data-slot='combobox-trigger'
      size='icon-xs'
      variant='ghost'
      className={cn('data-pressed:bg-transparent', className)}
      disabled={context.disabled}
      onClick={() => context.setOpen(!context.open)}
      {...props}
    >
      {children ?? <CaretDownIcon />}
    </InputGroupButton>
  )
}

function ComboboxClear({ className, ...props }: React.ComponentProps<typeof InputGroupButton>) {
  const context = useComboboxContext()

  return (
    <InputGroupButton
      data-slot='combobox-clear'
      size='icon-xs'
      variant='ghost'
      className={cn(className)}
      disabled={context.disabled}
      onClick={context.clear}
      {...props}
    >
      <XIcon />
    </InputGroupButton>
  )
}

function ComboboxInput({
  className,
  children,
  disabled,
  showTrigger = true,
  showClear = false,
  onBlur,
  onChange,
  onFocus,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof InputGroupInput> & {
  showTrigger?: boolean
  showClear?: boolean
}) {
  const context = useComboboxContext()
  const isDisabled = disabled ?? context.disabled

  return (
    <InputGroup className={cn('w-auto', className)}>
      <InputGroupInput
        role='combobox'
        aria-expanded={context.open}
        aria-required={context.required}
        disabled={isDisabled}
        required={context.required}
        value={context.query}
        onBlur={(event) => {
          window.setTimeout(() => context.setOpen(false), 100)
          onBlur?.(event)
        }}
        onChange={(event) => {
          context.setQuery(event.target.value)
          context.setOpen(true)
          onChange?.(event)
        }}
        onFocus={(event) => {
          context.setOpen(true)
          onFocus?.(event)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            context.setOpen(false)
          }
          onKeyDown?.(event)
        }}
        {...props}
      />
      <InputGroupAddon align='inline-end'>
        {showTrigger ? <ComboboxTrigger /> : null}
        {showClear && (context.query || context.selectedValue) ? <ComboboxClear /> : null}
      </InputGroupAddon>
      {children}
    </InputGroup>
  )
}

function ComboboxContent({ className, ...props }: React.ComponentProps<'div'>) {
  const context = useComboboxContext()

  if (!context.open) {
    return null
  }

  return (
    <div
      data-slot='combobox-content'
      className={cn(
        `bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2
        data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 absolute z-50
        mt-1 max-h-96 w-full overflow-hidden rounded-md shadow-md ring-1`,
        className
      )}
      {...props}
    />
  )
}

function ComboboxList<TItem extends ComboboxOption = ComboboxOption>({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  children?: React.ReactNode | ((item: TItem) => React.ReactNode)
}) {
  const context = useComboboxContext()
  const items = context.filteredItems as TItem[]

  return (
    <div
      data-slot='combobox-list'
      role='listbox'
      className={cn('max-h-80 overflow-y-auto p-1 data-empty:p-0', className)}
      data-empty={items.length === 0}
      {...props}
    >
      {typeof children === 'function' ? items.map((item) => children(item)) : children}
    </div>
  )
}

function ComboboxItem<TItem extends ComboboxOption = ComboboxOption>({
  className,
  children,
  value,
  onClick,
  ...props
}: Omit<React.ComponentProps<'button'>, 'value'> & {
  value: TItem
}) {
  const context = useComboboxContext()
  const isSelected = context.selectedValue === value.value

  return (
    <button
      type='button'
      data-slot='combobox-item'
      data-selected={isSelected}
      role='option'
      aria-selected={isSelected}
      className={cn(
        `hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground relative
        flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-left text-sm
        outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50
        [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
        className
      )}
      onClick={(event) => {
        context.selectItem(value)
        onClick?.(event)
      }}
      {...props}
    >
      {children}
      {isSelected ? (
        <span
          data-slot='combobox-item-indicator'
          className='pointer-events-none absolute right-2 flex size-4 items-center justify-center'
        >
          <CheckIcon className='size-4' />
        </span>
      ) : null}
    </button>
  )
}

function ComboboxGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='combobox-group'
      className={cn(className)}
      {...props}
    />
  )
}

function ComboboxLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='combobox-label'
      className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
      {...props}
    />
  )
}

function ComboboxCollection({ ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='combobox-collection'
      {...props}
    />
  )
}

function ComboboxEmpty({ className, ...props }: React.ComponentProps<'div'>) {
  const context = useComboboxContext()

  if (context.filteredItems.length > 0) {
    return null
  }

  return (
    <div
      data-slot='combobox-empty'
      className={cn('text-muted-foreground w-full justify-center py-2 text-center text-sm', className)}
      {...props}
    />
  )
}

function ComboboxSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='combobox-separator'
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

function ComboboxChips({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='combobox-chips'
      className={cn(
        `border-input focus-within:border-ring focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center
        gap-1.5 rounded-md border bg-transparent bg-clip-padding px-2.5 py-1.5 text-sm shadow-xs
        transition-[color,box-shadow] focus-within:ring-[3px]`,
        className
      )}
      {...props}
    />
  )
}

function ComboboxChip({
  className,
  showRemove: _showRemove = true,
  ...props
}: React.ComponentProps<'span'> & {
  showRemove?: boolean
}) {
  return (
    <span
      data-slot='combobox-chip'
      className={cn(
        `bg-muted text-foreground flex h-[calc(--spacing(5.5))] w-fit items-center justify-center gap-1
        rounded-sm px-1.5 text-xs font-medium whitespace-nowrap`,
        className
      )}
      {...props}
    />
  )
}

function ComboboxChipsInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot='combobox-chip-input'
      className={cn('min-w-16 flex-1 outline-none', className)}
      {...props}
    />
  )
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor
}
