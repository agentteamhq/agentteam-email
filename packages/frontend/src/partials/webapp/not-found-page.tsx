import { FileMagnifyingGlassIcon as FileQuestion } from '@phosphor-icons/react'

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

export function NotFoundPage(props: { data?: unknown }) {
  return (
    <div className='flex h-screen w-full items-center justify-center'>
      <Card className='mx-auto max-w-md text-center'>
        <CardHeader>
          <div className='flex justify-center'>
            <FileQuestion className='text-muted-foreground size-16' />
          </div>
          <CardTitle className='text-3xl'>404</CardTitle>
          <CardDescription className='text-xl'>Resource not found</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground'>
            The resource you are looking for doesn{`'`}t exist or has been moved.
          </p>
        </CardContent>
        <CardFooter className='flex justify-center'>
          <Button asChild>
            <Link href='/'>Go Home</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
