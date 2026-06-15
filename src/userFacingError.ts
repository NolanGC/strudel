import { Option, Schema as S } from 'effect'

export const ErrorMessage = S.Trim.pipe(S.decodeTo(S.NonEmptyString))
export type ErrorMessage = typeof ErrorMessage.Type
export const errorMessage = S.decodeUnknownSync(ErrorMessage)

export const toErrorMessage =
  (fallback: ErrorMessage) =>
  (error: unknown): ErrorMessage => {
    const message = (() => {
      if (error instanceof Error && error.message !== '') {
        return error.message
      }

      if (typeof error === 'object' && error !== null && 'message' in error) {
        const maybeMessage = S.decodeUnknownOption(ErrorMessage)(error.message)

        if (Option.isSome(maybeMessage)) {
          return maybeMessage.value
        }
      }

      if (typeof error === 'object' && error !== null && '_tag' in error) {
        return globalThis.String(error._tag)
      }

      return globalThis.String(error)
    })()

    return S.decodeUnknownOption(ErrorMessage)(message).pipe(
      Option.getOrElse(() => fallback),
    )
  }

export const errorCauseMessage =
  (fallback: ErrorMessage) =>
  (error: unknown): ErrorMessage => {
    if (typeof error === 'object' && error !== null && 'cause' in error) {
      return toErrorMessage(fallback)(error.cause)
    }

    return toErrorMessage(fallback)(error)
  }
