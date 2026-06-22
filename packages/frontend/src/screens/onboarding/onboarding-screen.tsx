import * as React from 'react'
import { ArrowRightIcon } from '@phosphor-icons/react'

import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import type { SyntheticEvent } from 'react'

export interface OnboardingFormValues {
  confirmPassword: string
  email: string
  password: string
}

export interface OnboardingScreenCopy {
  confirmPasswordDescription: string
  confirmPasswordLabel: string
  description: string
  emailDescription: string
  emailLabel: string
  emailPlaceholder: string
  passwordDescription: string
  passwordLabel: string
  submitLabel: string
  title: string
}

export interface OnboardingScreenProps extends Omit<React.ComponentProps<typeof Card>, 'onSubmit'> {
  copy?: Partial<OnboardingScreenCopy>
  defaultValues?: Partial<OnboardingFormValues>
  isSubmitting?: boolean
  onSubmit?: (values: OnboardingFormValues) => void
}

const defaultCopy = {
  confirmPasswordDescription: 'Re-enter the admin password for this instance.',
  confirmPasswordLabel: 'Confirm admin password',
  description: 'This account can finish instance setup and manage workspace access.',
  emailDescription: 'This email will be used for the initial administrator account.',
  emailLabel: 'Admin email',
  emailPlaceholder: 'admin@example.com',
  passwordDescription: 'Use a strong password for the admin account.',
  passwordLabel: 'Admin password',
  submitLabel: 'Set up instance',
  title: 'Create admin account'
} satisfies OnboardingScreenCopy

function getFormText(formData: FormData, key: keyof OnboardingFormValues) {
  const value = formData.get(key)

  return typeof value === 'string' ? value : ''
}

export function OnboardingScreen({
  copy: copyOverride,
  defaultValues,
  isSubmitting = false,
  onSubmit,
  ...props
}: OnboardingScreenProps) {
  const copy = { ...defaultCopy, ...copyOverride }
  const emailId = React.useId()
  const passwordId = React.useId()
  const confirmPasswordId = React.useId()

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    onSubmit?.({
      confirmPassword: getFormText(formData, 'confirmPassword'),
      email: getFormText(formData, 'email'),
      password: getFormText(formData, 'password')
    })
  }

  return (
    <Card {...props}>
      <CardHeader className='gap-2 px-7 pt-7 sm:px-8 sm:pt-8'>
        <CardTitle className='text-xl tracking-tight'>{copy.title}</CardTitle>
        <CardDescription className='max-w-[36ch] leading-6'>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className='px-7 pb-7 sm:px-8 sm:pb-8'>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={emailId}>{copy.emailLabel}</FieldLabel>
              <Input
                autoComplete='email'
                defaultValue={defaultValues?.email}
                disabled={isSubmitting}
                id={emailId}
                name='email'
                placeholder={copy.emailPlaceholder}
                required
                className='h-10'
                type='email'
              />
              <FieldDescription>{copy.emailDescription}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={passwordId}>{copy.passwordLabel}</FieldLabel>
              <Input
                autoComplete='new-password'
                defaultValue={defaultValues?.password}
                disabled={isSubmitting}
                id={passwordId}
                name='password'
                required
                className='h-10'
                type='password'
              />
              <FieldDescription>{copy.passwordDescription}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={confirmPasswordId}>{copy.confirmPasswordLabel}</FieldLabel>
              <Input
                autoComplete='new-password'
                defaultValue={defaultValues?.confirmPassword}
                disabled={isSubmitting}
                id={confirmPasswordId}
                name='confirmPassword'
                required
                className='h-10'
                type='password'
              />
              <FieldDescription>{copy.confirmPasswordDescription}</FieldDescription>
            </Field>
            <FieldGroup>
              <Field>
                <Button
                  className='h-10 w-full transition-transform active:translate-y-px'
                  disabled={isSubmitting}
                  type='submit'
                >
                  {copy.submitLabel}
                  <ArrowRightIcon data-icon='inline-end' />
                </Button>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
