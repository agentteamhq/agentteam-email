import { describe, expect, it, vi } from 'vitest'

import { createEmailToolHandler } from './tool'
import type { ToolRunContext } from '@paperclipai/plugin-sdk'

const runContext: ToolRunContext = {
  agentId: 'agent-1',
  companyId: 'company-1',
  projectId: 'project-1',
  runId: 'run-1'
}

describe('email tool input validation', () => {
  it('canonicalizes structured recipient mailboxes before invoking the CLI', async () => {
    expect.hasAssertions()
    const runCli = vi.fn(async () => ({ content: 'ok' }))
    const handler = createEmailToolHandler({ runCli })

    await expect(
      handler(
        {
          bcc: ['Hidden <Hidden@Example.Net>'],
          body: 'Body',
          cc: ['copy@example.net (Copy)'],
          operation: 'send',
          subject: 'Subject',
          to: ['Recipient <Recipient@Exämple.com>']
        },
        runContext
      )
    ).resolves.toStrictEqual({ content: 'ok' })

    expect(runCli).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({
          bcc: ['hidden@example.net'],
          cc: ['copy@example.net'],
          to: ['recipient@xn--exmple-cua.com']
        })
      }),
      undefined
    )
  })

  it('canonicalizes provision mailbox input before invoking the CLI', async () => {
    expect.hasAssertions()
    const runCli = vi.fn(async () => ({ content: 'ok' }))
    const handler = createEmailToolHandler({ runCli })

    await expect(
      handler(
        {
          mailbox: 'Mailbox <Mailbox@Exämple.com>',
          operation: 'provision'
        },
        runContext
      )
    ).resolves.toStrictEqual({ content: 'ok' })

    expect(runCli).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({
          mailbox: 'mailbox@xn--exmple-cua.com'
        })
      }),
      undefined
    )
  })

  it('rejects grouped, listed, and malformed mailbox fields', async () => {
    expect.hasAssertions()
    const runCli = vi.fn(async () => ({ content: 'ok' }))
    const handler = createEmailToolHandler({ runCli })

    await expect(
      handler(
        {
          body: 'Body',
          operation: 'send',
          subject: 'Subject',
          to: ['Team: one@example.net;']
        },
        runContext
      )
    ).resolves.toStrictEqual({ error: 'Email tool field to contains an invalid email address.' })
    await expect(
      handler(
        {
          body: 'Body',
          operation: 'send',
          subject: 'Subject',
          to: ['one@example.net, two@example.net']
        },
        runContext
      )
    ).resolves.toStrictEqual({ error: 'Email tool field to contains an invalid email address.' })
    await expect(
      handler(
        {
          body: 'Body',
          operation: 'send',
          subject: 'Subject',
          to: ['local@example.net@blocked.test']
        },
        runContext
      )
    ).resolves.toStrictEqual({ error: 'Email tool field to contains an invalid email address.' })

    expect(runCli).not.toHaveBeenCalled()
  })
})
