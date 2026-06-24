import {

  useAuth,
  useAuthPlugin,
  useCheckSlug
} from "@better-auth-ui/react"
import { useDebouncer } from "@tanstack/react-pacer"
import { CheckIcon as Check, XIcon as X } from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import { Field, FieldError } from "src/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "src/components/ui/input-group"
import { Label } from "src/components/ui/label"
import { Spinner } from "src/components/ui/spinner"
import { organizationPlugin } from "src/lib/auth/organization-plugin"
import { sanitizeSlug } from "./slug-utils"
import type { OrganizationAuthClient } from "@better-auth-ui/react";

/** Props for the `SlugField` component. */
export type SlugFieldProps = {
  value: string
  onChange: (value: string) => void
  currentSlug?: string
  disabled?: boolean
  id?: string
}

/**
 * Organization slug field with debounced availability checking.
 */
export function SlugField({
  value,
  onChange,
  currentSlug,
  disabled,
  id = "slug"
}: SlugFieldProps) {
  const { authClient, localization: authLocalization } = useAuth()
  const {
    localization,
    checkSlug: checkSlugEnabled,
    slugPrefix
  } = useAuthPlugin(organizationPlugin)

  const [slugError, setSlugError] = useState<string>()

  const {
    mutate: checkSlug,
    data: checkSlugData,
    error: checkSlugError,
    reset: resetCheckSlug
  } = useCheckSlug(authClient as OrganizationAuthClient)

  const debouncer = useDebouncer(
    (next: string) => {
      if (!checkSlugEnabled || !next.trim() || next.trim() === currentSlug) {
        return
      }

      checkSlug({ slug: next.trim() })
    },
    { wait: 500 }
  )

  useEffect(() => {
    if (!checkSlugEnabled) {
      return
    }

    resetCheckSlug()
    debouncer.maybeExecute(value)
  }, [checkSlugEnabled, value, debouncer, resetCheckSlug])

  return (
    <Field data-invalid={!!slugError}>
      <Label htmlFor={id}>{localization.slug}</Label>

      <InputGroup>
        {slugPrefix && (
          <InputGroupAddon align="inline-start">{slugPrefix}</InputGroupAddon>
        )}

        <InputGroupInput
          id={id}
          name="slug"
          value={value}
          onChange={(e) => {
            onChange(sanitizeSlug(e.target.value))
            setSlugError(undefined)
          }}
          onInvalid={(e) => {
            e.preventDefault()
            setSlugError(authLocalization.auth.fieldRequired)
          }}
          aria-invalid={!!slugError}
          placeholder={localization.slugPlaceholder}
          required
          disabled={disabled}
        />

        {checkSlugEnabled && !!value.trim() && value.trim() !== currentSlug && (
          <InputGroupAddon align="inline-end">
            {checkSlugData?.status ? (
              <Check className="size-4 text-foreground" />
            ) : checkSlugError ? (
              <X className="size-4 text-destructive" />
            ) : (
              <Spinner />
            )}
          </InputGroupAddon>
        )}
      </InputGroup>

      <FieldError>{slugError}</FieldError>
    </Field>
  )
}
