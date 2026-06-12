import { Match as M, Schema as S } from 'effect'
import type { GenericId } from 'convex/values'

type ConfectSchema<T> = {
  readonly Type: T
  readonly ast: unknown
}

type ConfectStructSchema<T> = ConfectSchema<T> & {
  readonly fields?: Readonly<Record<PropertyKey, ConfectSchema<unknown>>>
}

type WithSystemFields<TableName extends string, Fields> = Readonly<{
  _id: GenericId<TableName>
  _creationTime: number
}> &
  Fields

type ConfectAst =
  | { readonly _tag: 'UndefinedKeyword' }
  | { readonly _tag: 'Undefined' }
  | { readonly _tag: 'StringKeyword' }
  | { readonly _tag: 'String' }
  | { readonly _tag: 'NumberKeyword' }
  | { readonly _tag: 'Number' }
  | { readonly _tag: 'BooleanKeyword' }
  | { readonly _tag: 'Boolean' }
  | { readonly _tag: 'NullKeyword' }
  | { readonly _tag: 'Null' }
  | { readonly _tag: 'Literal'; readonly literal: string | number | boolean | null }
  | { readonly _tag: 'Union'; readonly types: ReadonlyArray<ConfectAst> }
  | {
      readonly _tag: 'TupleType'
      readonly elements: ReadonlyArray<unknown>
      readonly rest: ReadonlyArray<{ readonly type: ConfectAst }>
    }
  | { readonly _tag: 'Refinement'; readonly from: ConfectAst }
  | {
      readonly _tag: 'TypeLiteral'
      readonly propertySignatures: ReadonlyArray<{
        readonly name: PropertyKey
        readonly type: ConfectAst
        readonly isOptional?: boolean
      }>
      readonly indexSignatures?: ReadonlyArray<{
        readonly parameter: ConfectAst
        readonly type: ConfectAst
      }>
    }

const astTag = (ast: unknown): string =>
  typeof ast === 'object' &&
  ast !== null &&
  '_tag' in ast &&
  typeof ast._tag === 'string'
    ? ast._tag
    : 'missing _tag'

const unsupportedAst = (ast: unknown): never => {
  console.error('Unsupported Confect AST:', ast)
  throw new Error(`Unsupported Confect AST tag: ${astTag(ast)}`)
}

const isSupportedLiteral = (
  literal: string | number | boolean | null,
): literal is string | number | boolean | null =>
  literal === null ||
  typeof literal === 'string' ||
  typeof literal === 'number' ||
  typeof literal === 'boolean'

const compileAst = (ast: unknown): S.Top => {
  const typed = ast as ConfectAst

  return M.value(typed).pipe(
    M.withReturnType<S.Top>(),
    M.tags({
      UndefinedKeyword: () => S.Undefined,
      Undefined: () => S.Undefined,

      StringKeyword: () => S.String,
      String: () => S.String,

      NumberKeyword: () => S.Number,
      Number: () => S.Number,

      BooleanKeyword: () => S.Boolean,
      Boolean: () => S.Boolean,

      NullKeyword: () => S.Null,
      Null: () => S.Null,

      Literal: ({ literal }) => {
        if (literal === null) return S.Null
        if (isSupportedLiteral(literal)) return S.Literal(literal)

        throw new Error(`Unsupported Confect literal: ${globalThis.String(literal)}`)
      },

      Union: ({ types }) => {
        const members = types.map(compileAst)

        if (members.length === 0) {
          throw new Error('Unsupported empty Confect union')
        }

        return members.length === 1 ? members[0]! : S.Union(members)
      },

      TupleType: ({ elements, rest }) => {
        if (elements.length === 0 && rest.length === 1) {
          return S.Array(compileAst(rest[0]!.type))
        }

        throw new Error('Unsupported Confect tuple schema')
      },

      Refinement: ({ from }) => compileAst(from),

      TypeLiteral: ({ propertySignatures, indexSignatures = [] }) => {
        if (propertySignatures.length === 0 && indexSignatures.length === 1) {
          const [indexSignature] = indexSignatures

          return S.Record(
            compileAst(indexSignature!.parameter) as S.Record.Key,
            compileAst(indexSignature!.type),
          )
        }

        if (indexSignatures.length > 0) {
          throw new Error(
            'Unsupported Confect schema with both properties and index signatures',
          )
        }

        return S.Struct(
          Object.fromEntries(
            propertySignatures.map(property => [
              property.name,
              compileProperty(property),
            ]),
          ),
        )
      },
    }),
    M.orElse(() => unsupportedAst(ast)),
  )
}

const compileProperty = (property: {
  readonly type: ConfectAst
  readonly isOptional?: boolean
}): S.Top =>
  property.isOptional === true
    ? S.optional(compileAst(property.type))
    : compileAst(property.type)

const compileTypeLiteralAstFields = (
  ast: Extract<ConfectAst, { readonly _tag: 'TypeLiteral' }>,
): S.Struct.Fields => {
  if ((ast.indexSignatures ?? []).length > 0) {
    throw new Error('Unsupported Confect table fields with index signatures')
  }

  return Object.fromEntries(
    ast.propertySignatures.map(property => [
      property.name,
      compileProperty(property),
    ]),
  )
}

const compileFieldsMap = (
  fields: Readonly<Record<PropertyKey, ConfectSchema<unknown>>>,
): S.Struct.Fields =>
  Object.fromEntries(
    Object.entries(fields).map(([name, fieldSchema]) => [
      name,
      compileAst(fieldSchema.ast),
    ]),
  )

const compileTypeLiteralFields = (
  schema: ConfectStructSchema<unknown>,
): S.Struct.Fields => {
  const ast = schema.ast as ConfectAst | undefined

  if (ast?._tag === 'TypeLiteral') {
    return compileTypeLiteralAstFields(ast)
  }

  if (schema.fields !== undefined) {
    return compileFieldsMap(schema.fields)
  }

  throw new Error(
    `Expected Confect table fields to be a struct schema, got ${
      ast?._tag ?? 'missing ast'
    }`,
  )
}

export const confectSchemaToFoldkitSchema = <T>(
  schema: ConfectSchema<T>,
): S.Codec<T, T, never, never> =>
  compileAst(schema.ast) as S.Codec<T, T, never, never>

export const confectTableFieldsToFoldkitDocSchema = <
  const TableName extends string,
  Fields,
>(
  _tableName: TableName,
  schema: ConfectStructSchema<Fields>,
): S.Codec<
  WithSystemFields<TableName, Fields>,
  WithSystemFields<TableName, Fields>,
  never,
  never
> =>
  S.Struct({
    _id: S.String as unknown as S.Codec<
      GenericId<TableName>,
      GenericId<TableName>,
      never,
      never
    >,
    _creationTime: S.Number,
    ...compileTypeLiteralFields(schema),
  }) as unknown as S.Codec<
    WithSystemFields<TableName, Fields>,
    WithSystemFields<TableName, Fields>,
    never,
    never
  >