import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import type { ReactNode } from 'react'

export interface RecoveryEmailSentPageProps {
  logoimage?: ReactNode
}

export function RecoveryEmailSentPage(props: RecoveryEmailSentPageProps) {
  return (
    <div
      className='relative flex min-h-[70svh] w-full items-center justify-center overflow-x-hidden px-4 py-10'
    >
      <Card className='z-1 w-full max-w-md border shadow-md'>
        <CardHeader className='gap-6'>
          {props.logoimage}

          <div>
            <CardTitle className='mb-1.5 text-2xl'>Check your inbox</CardTitle>
            <CardDescription className='text-base'>
              A password reset link has been sent to your email address. Please check your inbox and click on
              the link to reset your password.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <div className='space-y-4'>
            <Button
              className='w-full'
              asChild
            >
              <a href='/signin/'>Back to sign in</a>
            </Button>

            <p className='text-muted-foreground text-center tracking-wide'>
              Didn&apos;t get the mail?{' '}
              <a
                href='/forgot-password/'
                className='text-card-foreground hover:underline'
              >
                Resend
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
