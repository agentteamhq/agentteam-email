import { cn } from '../../lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  // default bg bg-[#e0dedb]
  return (
    <div
      data-slot='skeleton'
      className={cn('dark:bg-accent animate-pulse rounded-md bg-[#e9e2dc]', className)}
      {...props}
    />
  )
}

export { Skeleton }
