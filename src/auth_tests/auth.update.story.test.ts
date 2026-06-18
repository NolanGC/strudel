import { Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { AuthSignedIn, AuthSignedOut } from '../authService'
import * as AuthPanel from '../authPanel'
import * as TodosPage from '../todosPage'
import {
  ClickedSignInWithGitHub,
  FailedSignIn,
  GotAuthPanelMessage,
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
import { errorMessage } from '../errorMessage'

const signedOutModel: Model = {
  route: TodosRoute(),
  authState: AuthSignedOut(),
  authPanel: AuthPanel.init(),
  todosPage: TodosPage.init(),
  maybeError: Option.none(),
}

describe('auth update', () => {
  test('UpdatedMagicLinkEmail updates the sign-in form', () => {
    Story.story(
      update,
      Story.with(signedOutModel),
      Story.message(
        GotAuthPanelMessage({
          message: UpdatedMagicLinkEmail({ email: 'nolan@example.com' }),
        }),
      ),
      Story.model(model => {
        expect(model.authPanel.magicLinkEmail).toBe('nolan@example.com')
      }),
    )
  })

  test('SubmittedMagicLink trims the email and starts the auth command', () => {
    Story.story(
      update,
      Story.with({
        ...signedOutModel,
        authPanel: {
          ...signedOutModel.authPanel,
          magicLinkEmail: '  nolan@example.com  ',
        },
      }),
      Story.message(GotAuthPanelMessage({ message: SubmittedMagicLink() })),
      Story.Command.expectHas(SendMagicLink),
      Story.Command.resolve(
        SendMagicLink,
        SentMagicLink(),
        message => GotAuthPanelMessage({ message }),
      ),
      Story.model(model => {
        expect(model.authPanel.maybeNotice).toStrictEqual(
          Option.some('Check your email for a sign-in link.'),
        )
        expect(model.authPanel.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('SubmittedMagicLink rejects an empty email before running a command', () => {
    Story.story(
      update,
      Story.with({
        ...signedOutModel,
        authPanel: { ...signedOutModel.authPanel, magicLinkEmail: '   ' },
      }),
      Story.message(GotAuthPanelMessage({ message: SubmittedMagicLink() })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.authPanel.maybeError).toStrictEqual(
          Option.some(errorMessage('Enter an email address.')),
        )
      }),
    )
  })

  test('ClickedSignInWithGitHub starts the GitHub auth command', () => {
    Story.story(
      update,
      Story.with(signedOutModel),
      Story.message(
        GotAuthPanelMessage({ message: ClickedSignInWithGitHub() }),
      ),
      Story.Command.expectHas(SignInWithGitHub),
      Story.Command.resolve(
        SignInWithGitHub,
        SucceededStartedGitHubSignIn(),
        message => GotAuthPanelMessage({ message }),
      ),
    )
  })

  test('FailedSignIn displays the provider error', () => {
    Story.story(
      update,
      Story.with({
        ...signedOutModel,
        authState: AuthSignedIn({ session: { displayName: 'Nolan' } }),
      }),
      Story.message(
        GotAuthPanelMessage({
          message: FailedSignIn({ error: errorMessage('Auth unavailable') }),
        }),
      ),
      Story.model(model => {
        expect(model.authPanel.maybeError).toStrictEqual(
          Option.some(errorMessage('Auth unavailable')),
        )
      }),
    )
  })
})
