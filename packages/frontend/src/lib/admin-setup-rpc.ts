export interface CreateFirstAdminInput {
  confirmPassword: string
  email: string
  password: string
}

export interface CreateFirstAdminResult {
  redirectTo: '/signin/'
}

export async function createFirstAdmin(input: CreateFirstAdminInput): Promise<CreateFirstAdminResult> {
  const response = await fetch('/rpc/admin/setup/first-admin', {
    body: JSON.stringify(input),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    method: 'POST'
  })

  const body = (await response.json().catch(() => ({}))) as { error?: unknown; redirectTo?: unknown }

  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Admin account could not be created.')
  }

  if (body.redirectTo !== '/signin/') {
    throw new Error('Admin setup returned an invalid redirect.')
  }

  return {
    redirectTo: body.redirectTo
  }
}
