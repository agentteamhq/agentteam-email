import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import type { ReactNode } from 'react'

export interface VerifyEmailSentPageProps {
  logoimage?: ReactNode
}

export function VerifyEmailSentPage(props: VerifyEmailSentPageProps) {
  return (
    <div
      className='relative flex min-h-[70svh] w-full items-center justify-center overflow-x-hidden px-4 py-10'
    >
      <Card className='z-1 w-full max-w-md border shadow-md'>
        <CardHeader className='gap-6'>
          {props.logoimage}

          <div>
            <CardTitle className='mb-1.5 text-2xl'>Verify your email</CardTitle>
            <CardDescription className='text-base'>
              An activation link has been sent to your email address. Please check your inbox and click on the
              link to complete the activation process.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}
