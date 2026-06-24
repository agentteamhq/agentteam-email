import {

  useAuth,
  useAuthPlugin,
  useCreateOrganization
} from "@better-auth-ui/react"
import { BriefcaseIcon as Briefcase } from "@phosphor-icons/react"
import {  useState } from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "src/components/ui/alert-dialog"
import { Button } from "src/components/ui/button"
import { Field, FieldError } from "src/components/ui/field"
import { Input } from "src/components/ui/input"
import { Label } from "src/components/ui/label"
import { Spinner } from "src/components/ui/spinner"
import { organizationPlugin } from "src/lib/auth/organization-plugin"
import { SlugField } from "./slug-field"
import { sanitizeSlug } from "./slug-utils"
import type { SyntheticEvent } from "react";
import type { OrganizationAuthClient } from "@better-auth-ui/react";

/** Props for the `CreateOrganizationDialog` component. */
export type CreateOrganizationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrganizationDialog({
  open,
  onOpenChange
}: CreateOrganizationDialogProps) {
  const { authClient, localization } = useAuth()
  const { localization: organizationLocalization } =
    useAuthPlugin(organizationPlugin)

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [nameError, setNameError] = useState<string>()

  const { mutate: createOrganization, isPending: isCreating } =
    useCreateOrganization(authClient as OrganizationAuthClient, {
      onSuccess: () => { onOpenChange(false); }
    })

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    createOrganization({ name, slug })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSlug("")
      setName("")
      setSlugEdited(false)
      setNameError(undefined)
    }
    onOpenChange(nextOpen)
  }

  const handleNameChange = (value: string) => {
    setName(value)
    setNameError(undefined)
    if (!slugEdited) {
      setSlug(sanitizeSlug(value))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Briefcase />
            </AlertDialogMedia>

            <AlertDialogTitle>
              {organizationLocalization.createOrganization}
            </AlertDialogTitle>

            <AlertDialogDescription>
              {organizationLocalization.organizationsDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-4">
            <Field data-invalid={!!nameError}>
              <Label htmlFor="create-organization-name">
                {organizationLocalization.name}
              </Label>

              <Input
                id="create-organization-name"
                name="name"
                autoFocus
                required
	                placeholder={organizationLocalization.namePlaceholder}
	                value={name}
	                onChange={(e) => {
	                  handleNameChange(e.target.value)
	                }}
                onInvalid={(e) => {
                  e.preventDefault()
                  setNameError(localization.auth.fieldRequired)
                }}
                aria-invalid={!!nameError}
                disabled={isCreating}
              />

              <FieldError>{nameError}</FieldError>
            </Field>

            <SlugField
              id="create-organization-slug"
              value={slug}
              onChange={(value) => {
                setSlug(value)
                setSlugEdited(true)
              }}
              disabled={isCreating}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreating}>
              {localization.settings.cancel}
            </AlertDialogCancel>

            <Button type="submit" disabled={isCreating}>
              {isCreating && <Spinner />}

              {organizationLocalization.createOrganization}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
