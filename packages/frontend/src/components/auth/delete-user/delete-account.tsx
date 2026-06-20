"use client"

import { authQueryKeys } from "@better-auth-ui/core"
import {
  useAuth,
  useAuthPlugin,
  useDeleteUser,
  useListAccounts
} from "@better-auth-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { WarningIcon as TriangleAlert } from "@phosphor-icons/react"
import type { Account } from "better-auth"
import { type SyntheticEvent, useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { deleteUserPlugin } from "@/lib/auth/delete-user-plugin"
import { cn } from "@/lib/utils"

export type DeleteAccountProps = {
  className?: string
}

/**
 * Danger-zone card to delete the authenticated account, with a confirmation dialog and toasts.
 */
export function DeleteAccount({ className }: DeleteAccountProps) {
  const { authClient, basePaths, localization, viewPaths, navigate } = useAuth()

  const {
    localization: deleteUserLocalization,
    sendDeleteAccountVerification
  } = useAuthPlugin(deleteUserPlugin)

  const { data: accountsData } = useListAccounts(authClient)
  const accounts = accountsData as Account[] | undefined

  const queryClient = useQueryClient()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [password, setPassword] = useState("")

  const hasCredentialAccount = accounts?.some(
    (account: Account) => account.providerId === "credential"
  )
  const needsPassword = !sendDeleteAccountVerification && hasCredentialAccount

  const { mutate: deleteUser, isPending } = useDeleteUser(authClient)

  const handleDialogOpenChange = (open: boolean) => {
    setConfirmOpen(open)
    setPassword("")
  }

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()

    const params = {
      ...(needsPassword ? { password } : {})
    }

    deleteUser(params, {
      onSuccess: () => {
        setConfirmOpen(false)
        setPassword("")

        if (sendDeleteAccountVerification) {
          toast.success(deleteUserLocalization.deleteUserVerificationSent)
        } else {
          toast.success(deleteUserLocalization.deleteUserSuccess)
          queryClient.removeQueries({ queryKey: authQueryKeys.all })
          navigate({
            to: `${basePaths.auth}/${viewPaths.auth.signIn}`,
            replace: true
          })
        }
      }
    })
  }

  return (
    <Card className={cn("border-destructive", className)}>
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium leading-tight">
            {deleteUserLocalization.deleteUser}
          </p>

          <p className="text-muted-foreground text-xs mt-0.5">
            {deleteUserLocalization.deleteUserDescription}
          </p>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={handleDialogOpenChange}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={!accounts}>
              {deleteUserLocalization.deleteUser}
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <form
              onSubmit={(event) => {
                handleSubmit(event).catch((error: unknown) => {
                  toast.error(error instanceof Error ? error.message : String(error))
                })
              }}
              className="flex flex-col gap-6"
            >
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                  <TriangleAlert />
                </AlertDialogMedia>

                <AlertDialogTitle>
                  {deleteUserLocalization.deleteUser}
                </AlertDialogTitle>

                <AlertDialogDescription>
                  {deleteUserLocalization.deleteUserDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>

              {needsPassword && (
                <Field>
                  <Label htmlFor="delete-password">
                    {localization.auth.password}
                  </Label>

                  <Input
                    id="delete-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder={localization.auth.passwordPlaceholder}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); }}
                    disabled={isPending}
                    required
                  />

                  <FieldError />
                </Field>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  {localization.settings.cancel}
                </AlertDialogCancel>

                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isPending}
                >
                  {isPending && <Spinner />}

                  {deleteUserLocalization.deleteUser}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
