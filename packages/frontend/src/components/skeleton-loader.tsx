export function SkeletonLoader() {
  return (
    <>
      <div className={'border-secondary-card-border dark:bg-foreground/10 border-b bg-white/80 px-8 py-4'}>
        <div className='mx-auto flex max-w-5xl flex-col gap-2 px-6'>
          <div className='space-y-3'>
            <div className='dark:bg-foreground/20 h-6 w-20 rounded-full bg-[#e8e4df]'></div>
            <div className='dark:bg-foreground/20 h-8 w-40 rounded-full bg-[#e8e4df]'></div>
            <div className='dark:bg-foreground/20 h-4 w-64 rounded-full bg-[#f0ede8]'></div>
          </div>
        </div>
        <div className='mx-auto mt-9 mb-1 flex max-w-5xl gap-2 overflow-hidden px-6'>
          <div
            className={'border-secondary-card-border bg-body-background h-9.5 w-24 rounded-full border'}
          ></div>
          <div
            className={'border-secondary-card-border bg-body-background h-9.5 w-24 rounded-full border'}
          ></div>
          <div
            className={'border-secondary-card-border bg-body-background h-9.5 w-24 rounded-full border'}
          ></div>
          <div
            className={'border-secondary-card-border bg-body-background h-9.5 w-24 rounded-full border'}
          ></div>
        </div>
      </div>

      <div className='mx-auto grid max-w-5xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-[1.1fr_1fr]'>
        <div
          className={`border-secondary-card-border dark:bg-foreground/20 rounded-xl border bg-white/80 p-6
            shadow-sm`}
        >
          <div className='border-secondary-card-border space-y-2 border-b pb-6'>
            <div className='dark:bg-foreground/20 h-4 w-28 rounded-full bg-[#f0ede8]'></div>
            <div className='dark:bg-foreground/20 h-3 w-56 rounded-full bg-[#f5f2ed]'></div>
          </div>
          <div className='mt-6 space-y-3'>
            <div className='dark:bg-foreground/20 h-4 w-full rounded-full bg-[#f5f2ed]'></div>
            <div className='dark:bg-foreground/20 h-4 w-5/6 rounded-full bg-[#f5f2ed]'></div>
            <div className='dark:bg-foreground/20 h-4 w-3/4 rounded-full bg-[#f5f2ed]'></div>
            <div className='dark:bg-foreground/20 h-4 w-2/3 rounded-full bg-[#f5f2ed]'></div>
          </div>
          <div className='border-secondary-card-border mt-6 flex flex-wrap gap-3 border-t pt-6'>
            <div className='h-10 w-40 rounded-md bg-[#2f2926]/10'></div>
            <div className='bg-body-background h-10 w-32 rounded-md'></div>
          </div>
        </div>

        <div
          className={`border-secondary-card-border dark:bg-foreground/20 rounded-xl border bg-white/90 p-6
            shadow-sm`}
        >
          <div className='border-secondary-card-border space-y-2 border-b pb-6'>
            <div className='dark:bg-foreground/20 h-4 w-24 rounded-full bg-[#f0ede8]'></div>
            <div className='dark:bg-foreground/20 h-3 w-64 rounded-full bg-[#f5f2ed]'></div>
          </div>
          <div className='mt-6 space-y-3'>
            <div className='dark:bg-foreground/20 h-4 w-full rounded-full bg-[#f5f2ed]'></div>
            <div className='dark:bg-foreground/20 h-4 w-5/6 rounded-full bg-[#f5f2ed]'></div>
            <div
              className={`border-secondary-card-border dark:bg-foreground/20 h-20 rounded-lg border
                border-dashed bg-[#faf8f6]`}
            ></div>
          </div>
        </div>
      </div>
    </>
  )
}
