"use client"

import { ApiKeys } from "./api-keys"

export type OrganizationApiKeysProps = {
  className?: string
}

export function OrganizationApiKeys({ className }: OrganizationApiKeysProps) {
  return <ApiKeys className={className} />
}
