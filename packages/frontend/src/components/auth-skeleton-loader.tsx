export function AuthSkeletonLoader() {
  return (
    <div className='flex w-full justify-center'>
      <div className='flex w-full max-w-sm flex-col items-center'>
        <div
          className={`text-card-foreground bg-surface border-secondary-card-border flex w-full max-w-sm
            flex-col gap-6 rounded-xl border py-6 shadow-sm`}
        >
          <div className='grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6'>
            <div className='flex w-full flex-col items-center text-center'>
              <div className='bg-accent mb-2 h-8 w-3/4 animate-pulse rounded-sm'></div>
              <div className='bg-accent h-4 w-1/2 animate-pulse rounded-sm'></div>
            </div>
          </div>
          <div className='grid gap-6 px-6'>
            <div className='grid gap-4'>
              <div className='grid w-full gap-6'>
                <div className='grid gap-2'>
                  <div className='bg-accent h-4 w-12 animate-pulse rounded-sm'></div>
                  <div
                    className={`border-secondary-card-border h-9 w-full animate-pulse rounded-md border
                      bg-transparent`}
                  ></div>
                </div>
                <div className='grid gap-2'>
                  <div className='flex items-center justify-between'>
                    <div className='bg-accent h-4 w-16 animate-pulse rounded-sm'></div>
                    <div className='bg-accent h-4 w-32 animate-pulse rounded-sm'></div>
                  </div>
                  <div
                    className={`border-secondary-card-border h-9 w-full animate-pulse rounded-md border
                      bg-transparent`}
                  ></div>
                </div>
              </div>
              <div className='h-9 w-full animate-pulse rounded-md bg-[#2f2926]/10'></div>
              <div className='bg-body-background h-9 w-full animate-pulse rounded-md'></div>
            </div>
            <div className='flex justify-center gap-2'>
              {/* <div class='shrink-0 h-px w-full grow bg-secondary-card-border'></div> */}
              <div className='bg-accent h-4 w-24 shrink-0 animate-pulse rounded-sm'></div>
              {/* <div class='shrink-0 h-px w-full grow bg-secondary-card-border'></div> */}
            </div>
          </div>
          <div className='grid gap-4 px-6'>
            <div
              className={`border-secondary-card-border h-9 w-full animate-pulse rounded-md border
                bg-transparent`}
            ></div>
          </div>

          <div className='flex items-center justify-center gap-1.5 px-6'>
            <div className='bg-accent h-4 w-48 animate-pulse rounded-sm'></div>
          </div>
        </div>
      </div>
    </div>
  )
}
