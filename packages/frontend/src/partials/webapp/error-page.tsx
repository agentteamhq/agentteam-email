'use client'

import { WarningCircleIcon as AlertCircle } from '@phosphor-icons/react'

import { Link } from '../../components/link'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import { LOCAL_STORAGE_STORE_KEY } from '../../store/use-store'

interface ErrorBoundaryInfo {
  componentStack?: string | null
}

interface ErrorPageProps {
  title?: string
  description?: string
  message?: string
  error?: unknown
  resetErrorBoundary?: (...args: unknown[]) => void
  info?: ErrorBoundaryInfo | null
  reset?: () => void
}

export function ErrorPage({
  title = 'Something went wrong',
  description = 'An error occurred',
  message = "We're having trouble processing your request right now. Please try refreshing the page or contact our support team if the problem persists."
}: ErrorPageProps) {
  const handleRefresh = () => {
    globalThis.localStorage.removeItem(LOCAL_STORAGE_STORE_KEY)
    globalThis.window.location.reload()
  }

  return (
    <div className='flex h-screen w-full items-center justify-center'>
      <Card className='mx-auto max-w-md text-center'>
        <CardHeader>
          <div className='flex justify-center'>
            <AlertCircle className='text-destructive size-16' />
          </div>
          <CardTitle className='text-3xl'>{title}</CardTitle>
          <CardDescription className='text-xl'>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground'>{message}</p>
        </CardContent>
        <CardFooter className='flex flex-col gap-2 sm:flex-row sm:justify-center'>
          <Button
            onClick={handleRefresh}
            variant='default'
          >
            Refresh Page
          </Button>
          <Button
            variant='outline'
            asChild
          >
            <Link href='/'>Go Home</Link>
          </Button>
          <Link
            className='inline-flex h-10 items-center justify-start rounded-md border border-slate-200 bg-white
              px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-900 underline-offset-4
              ring-offset-white transition-colors hover:bg-slate-100 hover:text-slate-900 hover:underline
              focus-visible:ring-0 focus-visible:ring-slate-950 focus-visible:ring-offset-0
              focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50
              dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:ring-offset-slate-950
              dark:hover:bg-slate-800 dark:hover:text-slate-50 dark:focus-visible:ring-slate-300'
            href='/support/'
            target='_blank'
            rel='noreferrer'
            unstyled
          >
            Contact Support
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
