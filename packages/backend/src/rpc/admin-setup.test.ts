import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminSetupTestState = vi.hoisted(() => ({
  countAdminUsersExec: vi.fn(),
  findUserByIdExec: vi.fn(),
  lockCreate: vi.fn(),
  lockDeleteOne: vi.fn(),
  lockDeleteOneExec: vi.fn(),
  signUpEmail: vi.fn(),
  updateUserExec: vi.fn()
}))

vi.mock('../globals', () => ({
  globals: vi.fn(async () => ({
    auth: {
      api: {
        signUpEmail: adminSetupTestState.signUpEmail
      }
    },
    db: {
      models: {
        user: {
          countDocuments: vi.fn(() => ({
            exec: adminSetupTestState.countAdminUsersExec
          })),
          findById: vi.fn(() => ({
            exec: adminSetupTestState.findUserByIdExec
          })),
          updateOne: vi.fn(() => ({
            exec: adminSetupTestState.updateUserExec
          }))
        },
        betterAuthSecondaryStorage: {
          create: adminSetupTestState.lockCreate,
          deleteOne: adminSetupTestState.lockDeleteOne
        }
      }
    }
  }))
}))

describe('admin setup RPC', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    adminSetupTestState.countAdminUsersExec.mockReset()
    adminSetupTestState.countAdminUsersExec.mockResolvedValue(0)
    adminSetupTestState.findUserByIdExec.mockReset()
    adminSetupTestState.findUserByIdExec.mockResolvedValue({
      _id: 'created-user-id',
      email: 'admin@example.test'
    })
    adminSetupTestState.lockCreate.mockReset()
    adminSetupTestState.lockCreate.mockResolvedValue({})
    adminSetupTestState.lockDeleteOne.mockReset()
    adminSetupTestState.lockDeleteOne.mockReturnValue({
      exec: adminSetupTestState.lockDeleteOneExec
    })
    adminSetupTestState.lockDeleteOneExec.mockReset()
    adminSetupTestState.lockDeleteOneExec.mockResolvedValue({ deletedCount: 0 })
    adminSetupTestState.signUpEmail.mockReset()
    adminSetupTestState.signUpEmail.mockResolvedValue({
      user: {
        id: 'created-user-id'
      }
    })
    adminSetupTestState.updateUserExec.mockReset()
    adminSetupTestState.updateUserExec.mockResolvedValue({
      matchedCount: 1
    })
  })

  it('creates the first admin through Better Auth and promotes only the created user', async () => {
    expect.hasAssertions()

    const response = await postFirstAdmin({
      confirmPassword: 'correct horse battery staple',
      email: 'Admin@Example.Test',
      password: 'correct horse battery staple'
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      redirectTo: '/signin/'
    })
    expect(adminSetupTestState.signUpEmail).toHaveBeenCalledWith({
      body: {
        email: 'admin@example.test',
        name: 'admin',
        password: 'correct horse battery staple',
        rememberMe: false
      },
      headers: expect.any(Headers)
    })
    expect(adminSetupTestState.lockCreate.mock.invocationCallOrder[0]).toBeLessThan(
      adminSetupTestState.signUpEmail.mock.invocationCallOrder[0] ?? 0
    )
    expect(adminSetupTestState.lockDeleteOne).toHaveBeenCalledWith({
      key: 'admin-setup:first-admin',
      value: expect.any(String)
    })
  })

  it('rejects setup when an admin user already exists', async () => {
    expect.hasAssertions()

    adminSetupTestState.countAdminUsersExec.mockResolvedValue(1)

    const response = await postFirstAdmin({
      confirmPassword: 'correct horse battery staple',
      email: 'admin@example.test',
      password: 'correct horse battery staple'
    })

    expect(response.status).toBe(409)
    expect(adminSetupTestState.signUpEmail).not.toHaveBeenCalled()
  })

  it('rejects concurrent setup when the first-admin setup lock is already held', async () => {
    expect.hasAssertions()

    adminSetupTestState.lockCreate.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: 11000 })
    )

    const response = await postFirstAdmin({
      confirmPassword: 'correct horse battery staple',
      email: 'admin@example.test',
      password: 'correct horse battery staple'
    })

    expect(response.status).toBe(409)
    expect(adminSetupTestState.signUpEmail).not.toHaveBeenCalled()
    expect(adminSetupTestState.lockDeleteOne).toHaveBeenCalledTimes(1)
  })

  it('releases the first-admin setup lock when Better Auth sign-up fails', async () => {
    expect.hasAssertions()

    adminSetupTestState.signUpEmail.mockRejectedValue(new Error('sign-up failed'))

    const response = await postFirstAdmin({
      confirmPassword: 'correct horse battery staple',
      email: 'admin@example.test',
      password: 'correct horse battery staple'
    })

    expect(response.status).toBe(400)
    expect(adminSetupTestState.lockDeleteOne).toHaveBeenCalledWith({
      expiresAt: { $lte: expect.any(Date) },
      key: 'admin-setup:first-admin'
    })
    expect(adminSetupTestState.lockDeleteOne).toHaveBeenCalledWith({
      key: 'admin-setup:first-admin',
      value: expect.any(String)
    })
  })

  it('rejects mismatched passwords before calling Better Auth', async () => {
    expect.hasAssertions()

    const response = await postFirstAdmin({
      confirmPassword: 'different password',
      email: 'admin@example.test',
      password: 'correct horse battery staple'
    })

    expect(response.status).toBe(400)
    expect(adminSetupTestState.signUpEmail).not.toHaveBeenCalled()
  })

  it('does not promote a synthetic duplicate sign-up user', async () => {
    expect.hasAssertions()

    adminSetupTestState.signUpEmail.mockResolvedValue({
      user: {
        id: 'synthetic-user-id'
      }
    })
    adminSetupTestState.findUserByIdExec.mockResolvedValue(null)

    const response = await postFirstAdmin({
      confirmPassword: 'correct horse battery staple',
      email: 'admin@example.test',
      password: 'correct horse battery staple'
    })

    expect(response.status).toBe(409)
    expect(adminSetupTestState.updateUserExec).not.toHaveBeenCalled()
  })
})

async function postFirstAdmin(body: {
  confirmPassword: string
  email: string
  password: string
}): Promise<Response> {
  const { default: adminSetup } = await import('./admin-setup')

  return adminSetup.handle(
    new Request('https://mail.example.com/admin/setup/first-admin', {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST'
    })
  )
}
