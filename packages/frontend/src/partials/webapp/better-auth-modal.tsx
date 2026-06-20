'use client'

import { Auth } from '../../components/auth/auth'
import { Dialog, DialogContent } from '../../components/ui/dialog'

interface BetterAuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  view?: 'signIn' | 'signUp'
}

export function BetterAuthModal({
  open,
  onOpenChange,
  view = 'signUp'
}: BetterAuthModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className='max-w-sm border-white/10 bg-[#151517] p-0'>
        <div className='p-6'>
          <Auth
            view={view}
            className='max-w-full border-none bg-transparent p-0 shadow-none'
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
