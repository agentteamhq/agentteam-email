"use client"

import { fileToBase64 } from "@better-auth-ui/core"
import { useAuth, useSession, useUpdateUser } from "@better-auth-ui/react"
import { TrashIcon as Trash2, UploadIcon as Upload } from "@phosphor-icons/react"
import type { User } from "better-auth"
import { type ChangeEvent, useRef, useState } from "react"
import { toast } from "sonner"
import { UserAvatar } from "@/components/auth/user/user-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Field } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

export type ChangeAvatarProps = {
  className?: string
}

export function ChangeAvatar({ className }: ChangeAvatarProps) {
  const { authClient, localization, avatar } = useAuth()
  const { data: session } = useSession(authClient)

  const { mutate: updateUser, isPending: updatePending } =
    useUpdateUser(authClient)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isPending = updatePending || isUploading || isDeleting

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    e.target.value = ""

    setIsUploading(true)

    try {
      const resized =
        (await avatar.resize?.(file, avatar.size, avatar.extension)) || file

      const image =
        (await avatar.upload?.(resized)) || (await fileToBase64(resized))

      updateUser(
        { image },
        {
          onSuccess: () =>
            toast.success(localization.settings.avatarChangedSuccess)
        }
      )
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message)
      }
    }

    setIsUploading(false)
  }

  function handleDelete() {
    const sessionUser = session?.user as User | undefined
    const currentImage = sessionUser?.image ?? undefined

    updateUser(
      { image: null },
      {
        onSuccess: () => {
          if (currentImage) {
            setIsDeleting(true)
            Promise.resolve(avatar.delete?.(currentImage))
              .catch((error: unknown) => {
                toast.error(error instanceof Error ? error.message : String(error))
              })
              .finally(() => {
                setIsDeleting(false)
              })
          }

          toast.success(localization.settings.avatarDeletedSuccess)
        }
      }
    )
  }

  return (
    <Field className={className}>
      <Label>{localization.settings.avatar}</Label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleFileChange(event).catch((error: unknown) => {
            toast.error(error instanceof Error ? error.message : String(error))
          })
        }}
      />

      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          className="p-0 h-auto w-auto rounded-full"
          disabled={isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <UserAvatar className="size-12" isPending={isPending} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              disabled={!session || isPending}
            >
              {isPending && <Spinner />}

              {localization.settings.changeAvatar}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="min-w-fit">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Upload className="text-muted-foreground" />

              {localization.settings.uploadAvatar}
            </DropdownMenuItem>

            <DropdownMenuItem
              variant="destructive"
              disabled={!session?.user.image}
              onClick={() => {
                handleDelete()
              }}
            >
              <Trash2 />

              {localization.settings.deleteAvatar}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Field>
  )
}
