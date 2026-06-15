import { Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { AuthSignedIn, AuthSignedOut } from '../authService'
import {
  ClickedSignInWithGitHub,
  FailedSignIn,
  type Model,
  SendMagicLink,
  SentMagicLink,
  SignInWithGitHub,
  SubmittedMagicLink,
  SucceededStartedGitHubSignIn,
  UpdatedMagicLinkEmail,
  update,
} from '../main'
import { TodosRoute } from '../route'
import { errorMessage } from '../userFacingError'

const signedOutModel: Model = {
  route: TodosRoute(),
  authState: AuthSignedOut(),
  magicLinkEmail: '',
  todos: [],
  newTodoText: '',
  loadState: 'Loading',
  maybeNotice: Option.none(),
  maybeError: Option.none(),
}

describe('auth update', () => {
  test('UpdatedMagicLinkEmail updates the sign-in form', () => {
    Story.story(
      update,
      Story.with(signedOutModel),
      Story.message(UpdatedMagicLinkEmail({ email: 'nolan@example.com' })),
      Story.model(model => {
        expect(model.magicLinkEmail).toBe('nolan@example.com')
      }),
    )
  })

  test('SubmittedMagicLink trims the email and starts the auth command', () => {
    Story.story(
      update,
      Story.with({
        ...signedOutModel,
        magicLinkEmail: '  nolan@example.com  ',
      }),
      Story.message(SubmittedMagicLink()),
      Story.Command.expectHas(SendMagicLink),
      Story.Command.resolve(SendMagicLink, SentMagicLink()),
      Story.model(model => {
        expect(model.maybeNotice).toStrictEqual(
          Option.some('Check your email for a sign-in link.'),
        )
        expect(model.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('SubmittedMagicLink rejects an empty email before running a command', () => {
    Story.story(
      update,
      Story.with({ ...signedOutModel, magicLinkEmail: '   ' }),
      Story.message(SubmittedMagicLink()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.maybeError).toStrictEqual(
          Option.some(errorMessage('Enter an email address.')),
        )
      }),
    )
  })

  test('ClickedSignInWithGitHub starts the GitHub auth command', () => {
    Story.story(
      update,
      Story.with(signedOutModel),
      Story.message(ClickedSignInWithGitHub()),
      Story.Command.expectHas(SignInWithGitHub),
      Story.Command.resolve(SignInWithGitHub, SucceededStartedGitHubSignIn()),
    )
  })

  test('FailedSignIn displays the provider error', () => {
    Story.story(
      update,
      Story.with({
        ...signedOutModel,
        authState: AuthSignedIn({ session: { displayName: 'Nolan' } }),
      }),
      Story.message(FailedSignIn({ error: errorMessage('Auth unavailable') })),
      Story.model(model => {
        expect(model.maybeError).toStrictEqual(
          Option.some(errorMessage('Auth unavailable')),
        )
      }),
    )
  })
})
