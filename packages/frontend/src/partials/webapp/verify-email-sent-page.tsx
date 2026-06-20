import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import type { ReactNode } from 'react'

export interface VerifyEmailSentPageProps {
  logoimage?: ReactNode
}

export function VerifyEmailSentPage(props: VerifyEmailSentPageProps) {
  return (
    <div
      className='relative my-24 flex h-auto items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6
        lg:px-8'
    >
      <Card className='z-1 w-full border shadow-md sm:max-w-md'>
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
