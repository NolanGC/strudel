import { Schema as S } from 'effect'

export const ErrorMessage = S.Trim.pipe(S.decodeTo(S.NonEmptyString))
export type ErrorMessage = typeof ErrorMessage.Type

export const errorMessage = S.decodeUnknownSync(ErrorMessage)
