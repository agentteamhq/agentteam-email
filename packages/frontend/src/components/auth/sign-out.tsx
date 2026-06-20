"use client"

import { useAuth, useSignOut } from "@better-auth-ui/react"
import { useEffect, useRef } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export type SignOutViewProps = {
  className?: string
}

export type SignOutProps = SignOutViewProps

export function SignOutView({ className }: SignOutViewProps) {
  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Signing out</CardTitle>
        <CardDescription>Clearing your session before returning to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <Spinner />
          <span>Redirecting to sign in</span>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Signs the current user out on mount and renders a centered spinner while the operation completes.
 *
 * @param className - Optional additional class names appended to the root element
 * @returns The sign-out progress view
 */
export function SignOut({ className }: SignOutProps) {
  const { authClient, basePaths, navigate, viewPaths } = useAuth()

  const { mutate: signOut } = useSignOut(authClient, {
    onError: () => {
      navigate({
        to: `${basePaths.auth}/${viewPaths.auth.signIn}`,
        replace: true
      })
    },
    onSuccess: () => {
      navigate({
        to: `${basePaths.auth}/${viewPaths.auth.signIn}`,
        replace: true
      })
    }
  })

  const hasSignedOut = useRef(false)

  useEffect(() => {
    if (hasSignedOut.current) {return}
    hasSignedOut.current = true

    signOut()
  }, [signOut])

  return <SignOutView className={className} />
}
