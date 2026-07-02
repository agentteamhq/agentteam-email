import * as React from 'react'
import { CopyIcon } from '@phosphor-icons/react'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { LocalDateTime } from '../../components/local-date-time'
import { cn } from '../../lib/utils'
import type { AgentMailAdminAgentEnrollment } from '@main/backend'

export interface AgentEnrollmentCommandSummaryProps {
  busy?: boolean
  canCopyCommand?: boolean
  className?: string
  enrollment: AgentMailAdminAgentEnrollment
  onCopyCommand?: (command: string) => void
}

export function AgentEnrollmentCommandSummary({
  busy = false,
  canCopyCommand,
  className,
  enrollment,
  onCopyCommand
}: AgentEnrollmentCommandSummaryProps) {
  const command = formatAgentEnrollmentCommand(enrollment.enrollmentToken)
  const copyEnabled = canCopyCommand ?? Boolean(onCopyCommand)
  const handleCopy = React.useCallback(() => {
    onCopyCommand?.(command)
  }, [command, onCopyCommand])

  return (
    <div className={cn('grid gap-3 p-3 text-sm', className)}>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate font-medium'>{enrollment.name}</p>
          <p className='text-muted-foreground truncate'>
            {enrollment.mailboxGrantCount} mailbox grants · {enrollment.systemPermissionCount} system
            permissions
          </p>
        </div>
        <Badge variant='outline'>{formatStatusLabel(enrollment.status)}</Badge>
      </div>
      <code
        className='bg-muted text-muted-foreground block overflow-x-auto rounded-md border px-3 py-2
          font-mono text-xs'
      >
        {command}
      </code>
      <div className='text-muted-foreground grid gap-1 sm:grid-cols-3'>
        <span>Host {formatReferenceId(enrollment.hostId)}</span>
        <span>
          Token expires{' '}
          <LocalDateTime
            value={enrollment.enrollmentTokenExpiresAt}
            emptyFallback='Never'
          />
        </span>
        <span>
          Grants expire{' '}
          <LocalDateTime
            value={enrollment.grantExpiresAt}
            emptyFallback='Never'
          />
        </span>
      </div>
      <div>
        <Button
          disabled={busy || !copyEnabled || !onCopyCommand}
          onClick={handleCopy}
          size='sm'
          variant='outline'
        >
          <CopyIcon />
          Copy command
        </Button>
      </div>
    </div>
  )
}

function formatAgentEnrollmentCommand(enrollmentToken: string): string {
  return `at-email agent enroll ${enrollmentToken}`
}

function formatReferenceId(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown'
  }

  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

function formatStatusLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}
