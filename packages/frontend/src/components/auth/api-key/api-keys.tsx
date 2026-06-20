"use client"

import {
  type ApiKeyAuthClient,
  type ListedApiKey,
  useAuth,
  useAuthPlugin,
  useListApiKeys
} from "@better-auth-ui/react"
import { type ReactNode, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { apiKeyPlugin } from "@/lib/auth/api-key-plugin"
import { cn } from "@/lib/utils"
import { ApiKey } from "./api-key"
import { ApiKeySkeleton } from "./api-key-skeleton"
import { ApiKeysEmpty } from "./api-keys-empty"
import { CreateApiKeyDialog } from "./create-api-key-dialog"

export type ApiKeysProps = {
  className?: string
  /** Actions rendered beside the create button. */
  headerActions?: ReactNode
  /** Send list and create payloads for a specific organization. */
  organizationId?: string
  /** Force the loading skeleton and disable the list query. */
  isPending?: boolean
  /** Hide the "Create API key" button (header + empty state). */
  hideCreate?: boolean
  /** Hide the per-row delete button on listed keys. */
  hideDelete?: boolean
}

export function ApiKeys({
  className,
  headerActions,
  organizationId,
  isPending: isPendingProp,
  hideCreate,
  hideDelete
}: ApiKeysProps) {
  const { authClient } = useAuth()
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin)

  const { data: listData, isPending: isListPending } = useListApiKeys(
    authClient as ApiKeyAuthClient,
    {
      enabled: !isPendingProp,
      ...(organizationId
        ? { query: { organizationId, configId: "organization" } }
        : {})
    }
  )

  const isPending = isPendingProp || isListPending
  const apiKeys = listData?.apiKeys as ListedApiKey[] | undefined

  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="truncate text-sm font-semibold">
          {apiKeyLocalization.apiKeys}
        </h2>

        <div className="flex shrink-0 items-center gap-2">
          {headerActions}

          {!hideCreate && (
            <Button
              className="shrink-0"
              size="sm"
              disabled={isPending}
              onClick={() => { setCreateOpen(true); }}
            >
              {apiKeyLocalization.createApiKey}
            </Button>
          )}
        </div>
      </div>

      <Card className="p-0">
        <CardContent className="p-0">
          {isPending ? (
            <ApiKeySkeleton />
          ) : !apiKeys?.length ? (
            <ApiKeysEmpty
              onCreatePress={() => { setCreateOpen(true); }}
              hideCreate={hideCreate}
            />
          ) : (
            apiKeys.map((key: ListedApiKey, index: number) => (
              <div key={key.id}>
                {index > 0 && <Separator />}

                <ApiKey
                  apiKey={key}
                  hideDelete={hideDelete}
                  organizationId={organizationId}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {!hideCreate && (
        <CreateApiKeyDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          organizationId={organizationId}
        />
      )}
    </div>
  )
}
