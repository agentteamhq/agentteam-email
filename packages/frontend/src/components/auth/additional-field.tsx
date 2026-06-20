"use client"

import {
  type AdditionalField as AdditionalFieldConfig,
  resolveInputType
} from "@better-auth-ui/core"
import { useAuth } from "@better-auth-ui/react"
import { CheckIcon as Check, CopyIcon as Copy } from "@phosphor-icons/react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

export type AdditionalFieldProps = {
  name: string
  field: AdditionalFieldConfig
  isPending?: boolean
}

function fieldValue(value: AdditionalFieldConfig["defaultValue"]) {
  if (value == null) {return undefined}
  if (value instanceof Date) {return value.toISOString()}
  return String(value)
}

function dateInputValue(value: AdditionalFieldConfig["defaultValue"], inputType: "date" | "datetime-local") {
  if (!value) {return undefined}
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") {
    return undefined
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {return undefined}

  if (inputType === "date") {
    return date.toISOString().slice(0, 10)
  }

  return date.toISOString().slice(0, 16)
}

function CopyButton({
  getValue,
  isDisabled
}: {
  getValue: () => string | undefined
  isDisabled?: boolean
}) {
  const { localization } = useAuth()
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const value = getValue()
    if (!value) {return}

    try {
      await globalThis.navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => { setCopied(false); }, 1500)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <InputGroupButton
      aria-label={localization.settings.copyToClipboard}
      title={localization.settings.copyToClipboard}
      onClick={() => {
        handleCopy().catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error))
        })
      }}
      disabled={isDisabled}
    >
      {copied ? <Check /> : <Copy />}
    </InputGroupButton>
  )
}

export function AdditionalField({ name, field, isPending }: AdditionalFieldProps) {
  const inputType = resolveInputType(field)
  const inputRef = useRef<HTMLInputElement>(null)

  if (field.render) {
    return <>{field.render({ name, field, isPending })}</>
  }

  if (inputType === "hidden") {
    return (
      <input
        type="hidden"
        name={name}
        value={fieldValue(field.defaultValue) ?? ""}
      />
    )
  }

  if (inputType === "textarea") {
    return (
      <Field>
        <Label htmlFor={name}>{field.label}</Label>
        <Textarea
          id={name}
          name={name}
          defaultValue={fieldValue(field.defaultValue)}
          placeholder={field.placeholder}
          required={field.required}
          readOnly={field.readOnly}
          disabled={isPending}
        />
        <FieldError />
      </Field>
    )
  }

  if (inputType === "switch" || inputType === "checkbox") {
    const checked = field.defaultValue === true || field.defaultValue === "true"

    return (
      <Field orientation="horizontal">
        {inputType === "switch" ? (
          <Switch
            id={name}
            name={name}
            defaultChecked={checked}
            disabled={isPending || field.readOnly}
          />
        ) : (
          <Checkbox
            id={name}
            name={name}
            defaultChecked={checked}
            disabled={isPending || field.readOnly}
          />
        )}
        <Label htmlFor={name}>{field.label}</Label>
        <FieldError />
      </Field>
    )
  }

  if (inputType === "select" || inputType === "combobox") {
    return (
      <Field>
        <Label htmlFor={name}>{field.label}</Label>
        <Select
          name={name}
          defaultValue={fieldValue(field.defaultValue)}
          disabled={isPending || field.readOnly}
          required={field.required}
        >
          <SelectTrigger id={name}>
            <SelectValue placeholder={field.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError />
      </Field>
    )
  }

  if (inputType === "date" || inputType === "datetime") {
    const htmlInputType = inputType === "date" ? "date" : "datetime-local"

    return (
      <Field>
        <Label htmlFor={name}>{field.label}</Label>
        <Input
          id={name}
          name={name}
          type={htmlInputType}
          defaultValue={dateInputValue(field.defaultValue, htmlInputType)}
          required={field.required}
          readOnly={field.readOnly}
          disabled={isPending}
        />
        <FieldError />
      </Field>
    )
  }

  return (
    <Field>
      <Label htmlFor={name}>{field.label}</Label>
      <InputGroup>
        {field.prefix ? <InputGroupAddon>{field.prefix}</InputGroupAddon> : null}
        <InputGroupInput
          ref={inputRef}
          id={name}
          name={name}
          type={inputType === "number" || inputType === "slider" ? "number" : "text"}
          inputMode={
            inputType === "number" || inputType === "slider" ? "decimal" : undefined
          }
          min={field.min}
          max={field.max}
          step={field.step}
          defaultValue={fieldValue(field.defaultValue)}
          placeholder={field.placeholder}
          required={field.required}
          readOnly={field.readOnly}
          disabled={isPending}
        />
        {field.suffix ? <InputGroupAddon>{field.suffix}</InputGroupAddon> : null}
        {field.copyable ? (
          <InputGroupAddon align="inline-end">
            <CopyButton
              getValue={() => inputRef.current?.value}
              isDisabled={isPending}
            />
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <FieldError />
    </Field>
  )
}
