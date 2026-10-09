const mockLoadApplication = jest.fn()
const mockLoadRegistration = jest.fn()
const mockListChildren = jest.fn()

jest.mock('$env/dynamic/private', () => ({ env: {} }), { virtual: true })

// ESM-only, and unused before the redirect these tests cover.
jest.mock('sveltekit-superforms', () => ({
  message: jest.fn(),
  superValidate: jest.fn(),
}))
jest.mock('sveltekit-superforms/adapters', () => ({ zod: jest.fn() }))

jest.mock('$lib/server/instructorApplication', () => ({
  loadApplication: (...args: any[]) => mockLoadApplication(...args),
  saveApplicationDraft: jest.fn(),
  submitApplication: jest.fn(),
}))

jest.mock('$lib/server/studentRegistration', () => ({
  isOpenableChild: jest.fn(),
  listChildren: (...args: any[]) => mockListChildren(...args),
  loadRegistration: (...args: any[]) => mockLoadRegistration(...args),
  saveRegistrationDraft: jest.fn(),
  submitRegistration: jest.fn(),
}))

import { load } from '../src/routes/(signedIn)/(emailVerified)/apply/+page.server'

// The (emailVerified) layout's redirect doesn't stop this load, which SvelteKit
// runs alongside it, and opening the page creates draft documents.
describe('/apply load', () => {
  beforeEach(() => {
    mockLoadApplication.mockReset()
    mockLoadRegistration.mockReset()
    mockListChildren.mockReset()
  })

  it.each(['instructor', 'student'])(
    'sends an unverified %s account to /profile without touching their drafts',
    async (role) => {
      await expect(
        load({
          locals: {
            user: {
              uid: 'uid',
              email: 'person@test.com',
              role,
              emailVerified: false,
            },
          },
          url: new URL('https://portal.gbstem.org/apply'),
        } as any),
      ).rejects.toMatchObject({ status: 303, location: '/profile' })
      expect(mockLoadApplication).not.toHaveBeenCalled()
      expect(mockListChildren).not.toHaveBeenCalled()
      expect(mockLoadRegistration).not.toHaveBeenCalled()
    },
  )

  it('sends a signed-out visitor to /profile too', async () => {
    await expect(
      load({
        locals: { user: null },
        url: new URL('https://portal.gbstem.org/apply'),
      } as any),
    ).rejects.toMatchObject({ status: 303 })
  })
})
