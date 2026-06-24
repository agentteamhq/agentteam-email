"use client"

import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import {
  CheckIcon as Check,
  CopyIcon as Copy,
  KeyIcon as Key
} from "@phosphor-icons/react"
import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "src/components/ui/alert-dialog"
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput
} from "src/components/ui/input-group"
import { Label } from "src/components/ui/label"
import { apiKeyPlugin } from "src/lib/auth/api-key-plugin"

export type NewApiKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string | null
  secretKey: string | null
}

export function NewApiKeyDialog({
  open,
  onOpenChange,
  name,
  secretKey
}: NewApiKeyDialogProps) {
  const { localization } = useAuth()
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin)

  const [copied, setCopied] = useState(false)

  const copySecretKey = () => {
    if (!secretKey) {
      return
    }

    globalThis.navigator.clipboard
      .writeText(secretKey)
      .then(() => {
        setCopied(true)
        globalThis.setTimeout(() => {
          setCopied(false)
        }, 1500)
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error))
      })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Key />
          </AlertDialogMedia>

          <AlertDialogTitle>{apiKeyLocalization.newApiKey}</AlertDialogTitle>

          <AlertDialogDescription>
            {apiKeyLocalization.newApiKeyWarning}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-api-key-secret">
            {name || apiKeyLocalization.apiKey}
          </Label>

          <InputGroup>
            <InputGroupInput
              id="new-api-key-secret"
              value={secretKey ?? ""}
              readOnly
              className="font-mono text-xs"
            />

            <InputGroupButton
              size="icon-xs"
              aria-label={localization.settings.copyToClipboard}
              onClick={copySecretKey}
            >
              {copied ? <Check /> : <Copy />}
            </InputGroupButton>
          </InputGroup>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction>
            {apiKeyLocalization.dismissNewKey}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
