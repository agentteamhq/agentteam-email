import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

export function VerifyEmailSentPage() {
  return (
    <Card className='border-secondary-card-border bg-surface w-full max-w-sm gap-4 shadow-sm'>
      <CardHeader>
        <CardTitle className='text-xl font-semibold'>Verify your email</CardTitle>
        <CardDescription>
          An activation link has been sent to your email address. Please check your inbox and click the link
          to complete activation.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
