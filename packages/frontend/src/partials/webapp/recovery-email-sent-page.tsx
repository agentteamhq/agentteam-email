import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

export function RecoveryEmailSentPage() {
  return (
    <Card className='border-secondary-card-border bg-surface w-full max-w-sm gap-4 shadow-sm'>
      <CardHeader>
        <CardTitle className='text-xl font-semibold'>Check your inbox</CardTitle>
        <CardDescription>
          A password reset link has been sent to your email address. Please check your inbox and click the
          link to reset your password.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className='space-y-4'>
          <Button
            className='w-full'
            asChild
          >
            <a href='/signin/'>Back to sign in</a>
          </Button>

          <p className='text-muted-foreground text-center text-sm'>
            Didn&apos;t get the mail?{' '}
            <a
              href='/forgot-password/'
              className='text-foreground font-medium underline-offset-4 hover:underline'
            >
              Resend
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
