import { Schema } from 'effect'

export const UserId = Schema.NonEmptyString.pipe(Schema.brand('UserId'))
export type UserId = typeof UserId.Type

export const TodoText = Schema.NonEmptyString.pipe(Schema.brand('TodoText'))
export type TodoText = typeof TodoText.Type

export const CronExpression = Schema.NonEmptyString.pipe(
  Schema.brand('CronExpression'),
)
export type CronExpression = typeof CronExpression.Type

export const EpochMillis = Schema.Number.pipe(Schema.brand('EpochMillis'))
export type EpochMillis = typeof EpochMillis.Type

export const UploadUrl = Schema.NonEmptyString.pipe(Schema.brand('UploadUrl'))
export type UploadUrl = typeof UploadUrl.Type

export const ImageUrl = Schema.NonEmptyString.pipe(Schema.brand('ImageUrl'))
export type ImageUrl = typeof ImageUrl.Type

export const AuthToken = Schema.NonEmptyString.pipe(Schema.brand('AuthToken'))
export type AuthToken = typeof AuthToken.Type

export const RefreshToken = Schema.NonEmptyString.pipe(
  Schema.brand('RefreshToken'),
)
export type RefreshToken = typeof RefreshToken.Type

export const OAuthVerifier = Schema.NonEmptyString.pipe(
  Schema.brand('OAuthVerifier'),
)
export type OAuthVerifier = typeof OAuthVerifier.Type

export const AuthEmail = Schema.NonEmptyString.pipe(Schema.brand('AuthEmail'))
export type AuthEmail = typeof AuthEmail.Type

export const DisplayName = Schema.NonEmptyString.pipe(
  Schema.brand('DisplayName'),
)
export type DisplayName = typeof DisplayName.Type
