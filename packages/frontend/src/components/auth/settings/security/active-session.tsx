import { useAuth, useRevokeSession, useSession } from "@better-auth-ui/react"
import Bowser from "bowser"
import {
  SignOutIcon as LogOut,
  MonitorIcon as Monitor,
  DeviceMobileIcon as Smartphone,
  TerminalWindowIcon as Terminal,
  XIcon as X
} from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "src/components/ui/button"
import { Card, CardContent } from "src/components/ui/card"
import { Spinner } from "src/components/ui/spinner"
import { parseAtEmailUserAgent } from "./active-session-user-agent"
import type { Session } from "better-auth"

function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

  const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1]
  ]

  for (const [unit, threshold] of UNITS) {
    if (seconds >= threshold) {
      return rtf.format(-Math.floor(seconds / threshold), unit)
    }
  }

  return rtf.format(0, "second")
}

export type ActiveSessionProps = {
  activeSession: Session
}

/**
 * Render a single active session row with device info and revoke control.
 *
 * Shows the session's browser, OS, and creation time. The current session is marked
 * and navigates to sign-out on click, while other sessions can be revoked individually.
 *
 * @param session - The session object containing id, token, userAgent, ipAddress, and createdAt
 * @returns A JSX element containing the active session row
 */
export function ActiveSession({ activeSession }: ActiveSessionProps) {
  const { authClient, basePaths, localization, viewPaths, navigate } = useAuth()
  const { data: session } = useSession(authClient, { refetchOnMount: false })

  const { mutate: revokeSession, isPending: isRevoking } = useRevokeSession(
    authClient,
    {
      onSuccess: () => toast.success(localization.settings.revokeSessionSuccess)
    }
  )

  const isCurrentSession = activeSession.token === session?.session.token
  const ua = Bowser.parse(activeSession.userAgent || "")
  const cliSession = parseAtEmailUserAgent(activeSession.userAgent)
  const isMobile =
    ua.platform.type === "mobile" || ua.platform.type === "tablet"
  const sessionTitle =
    cliSession?.label ??
    `${ua.browser.name || "Unknown Browser"}${ua.os.name ? `, ${ua.os.name}` : ""}`
  const sessionMetadata = cliSession?.platform
  const sessionAge = activeSession.createdAt
    ? timeAgo(activeSession.createdAt)
    : null
  const sessionDetails = [sessionMetadata, sessionAge].filter(Boolean).join(" - ")

  return (
    <Card className="bg-transparent border-0 ring-0 shadow-none">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          {cliSession ? (
            <Terminal className="size-4.5" />
          ) : isMobile ? (
            <Smartphone className="size-4.5" />
          ) : (
            <Monitor className="size-4.5" />
          )}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">{sessionTitle}</span>

          {isCurrentSession ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary w-fit">
                {localization.settings.currentSession}
              </span>
              {sessionMetadata ? (
                <span className="text-xs text-muted-foreground">
                  {sessionMetadata}
                </span>
              ) : null}
            </span>
          ) : sessionDetails ? (
            <span className="text-xs text-muted-foreground capitalize">
              {sessionDetails}
            </span>
          ) : null}
        </div>

        <Button
          className="ml-auto shrink-0"
          variant="outline"
          size="sm"
          onClick={() => {
            if (isCurrentSession) {
              navigate({
                to: `${basePaths.auth}/${viewPaths.auth.signOut}`
              })
              return
            }

            revokeSession(activeSession)
          }}
          disabled={isRevoking}
          aria-label={
            isCurrentSession
              ? localization.auth.signOut
              : localization.settings.revokeSession
          }
        >
          {isRevoking ? <Spinner /> : isCurrentSession ? <LogOut /> : <X />}

          {isCurrentSession
            ? localization.auth.signOut
            : localization.settings.revoke}
        </Button>
      </CardContent>
    </Card>
  )
}
