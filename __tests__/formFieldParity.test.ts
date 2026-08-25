// Guards the hand-maintained field lists that a registration/application value
// passes through on its way to and from Firestore. Each form keeps the same set
// of fields written out four separate times - the Zod schema, the
// `getXFormDefaults()` factory, `createEmptyX()`, and the explicit allowlist in
// `toXFormValues()` - and nothing but review currently keeps them in step.
//
// A field present in the schema but missing from `toXFormValues()` is the worst
// case and the reason these tests exist: the same allowlist sits on both the
// read side and the display side, so the omission is invisible in the UI, and
// the next autosave merges the (absent, therefore default) value back over the
// stored one and silently clobbers it. These tests derive the field list from
// the schema itself, so adding a field without wiring it fails here rather than
// in production.
import {
  applicationSchema,
  classDetailsFormSchema,
  getApplyFormDefaults,
  getRegistrationFormDefaults,
  registrationSchema,
} from '$lib/components/forms/schemas'
import {
  APPLICATION_ADMIN_OWNED_FIELDS,
  applicationOwnedFields,
  createEmptyApplication,
  normalizeApplicationData,
  toApplyFormValues,
} from '$lib/helpers/applyForm'
import {
  getDefaultClassValues,
  toFormValues as toClassFormValues,
} from '$lib/helpers/classDetailsForm'
import {
  createEmptyRegistration,
  normalizeRegistrationData,
  REGISTRATION_ADMIN_OWNED_FIELDS,
  registrationOwnedFields,
  toRegistrationFormValues,
} from '$lib/helpers/registrationForm'
import { z } from 'zod'
import type {} from '../src/data.d.ts'

type LeafKind = 'string' | 'number' | 'boolean' | 'array'
type Leaf = { path: string; kind: LeafKind }

/**
 * Peels ZodOptional/ZodDefault/ZodNullable/ZodEffects wrappers off a schema
 * node until the type that actually describes the field is reached.
 */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: any = schema
  for (;;) {
    const def = current?._def
    if (!def) return current
    if (def.innerType) {
      current = def.innerType
    } else if (def.schema) {
      current = def.schema
    } else {
      return current
    }
  }
}

/**
 * Flattens a Zod object schema into dotted leaf paths plus the kind of value
 * each holds. Unknown Zod types throw rather than being skipped, so a schema
 * that grows a type this walker doesn't understand fails loudly instead of
 * quietly dropping that field out of every assertion below.
 */
function schemaLeaves(schema: z.ZodTypeAny, prefix = ''): Leaf[] {
  const node = unwrap(schema)
  if (node instanceof z.ZodObject) {
    return Object.entries(node.shape as Record<string, z.ZodTypeAny>).flatMap(
      ([key, child]) => schemaLeaves(child, prefix ? `${prefix}.${key}` : key),
    )
  }
  let kind: LeafKind
  if (node instanceof z.ZodString || node instanceof z.ZodEnum) {
    kind = 'string'
  } else if (node instanceof z.ZodNumber) {
    kind = 'number'
  } else if (node instanceof z.ZodBoolean) {
    kind = 'boolean'
  } else if (node instanceof z.ZodArray) {
    kind = 'array'
  } else {
    throw new Error(
      `schemaLeaves: unhandled Zod type at "${prefix}" - teach this walker about it`,
    )
  }
  return [{ path: prefix, kind }]
}

/** Flattens a plain object into dotted leaf paths (arrays count as leaves). */
function objectLeaves(value: any, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix]
  }
  return Object.entries(value).flatMap(([key, child]) =>
    objectLeaves(child, prefix ? `${prefix}.${key}` : key),
  )
}

function hasPath(obj: any, path: string): boolean {
  let current = obj
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object' || !(key in current)) {
      return false
    }
    current = current[key]
  }
  return true
}

function getPath(obj: any, path: string): any {
  return path
    .split('.')
    .reduce(
      (acc, key) => (acc === null || acc === undefined ? acc : acc[key]),
      obj,
    )
}

function setPath(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  const last = keys.pop() as string
  let current = obj
  for (const key of keys) {
    if (current[key] === null || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key]
  }
  current[last] = value
}

/**
 * A value distinguishable from every default the pipeline could substitute.
 * Numbers stay non-zero and `form` booleans stay `true` so that the
 * `|| fallback` and `!== undefined ? ... : false` idioms in the `toXFormValues`
 * mappers can't mask a dropped field by coincidentally producing the same value.
 *
 * `source` distinguishes a value that came from the last-loaded document from
 * one the user just typed. The `ownedFields` tests populate both sides with
 * different sentinels so they can assert which one actually wins - a field that
 * silently falls back to the stored value looks identical to a working one
 * unless the two are told apart.
 */
function sentinelFor(
  leaf: Leaf,
  index: number,
  source: 'values' | 'form' = 'form',
): any {
  switch (leaf.kind) {
    case 'string':
      return `${source}-${leaf.path}`
    case 'number':
      return (source === 'form' ? 3000 : 2000) + index
    case 'boolean':
      return source === 'form'
    case 'array':
      return [`${source}-${leaf.path}`]
  }
}

/** Builds a document with every schema leaf set to its `source` sentinel. */
function populate(base: any, leaves: Leaf[], source: 'values' | 'form'): any {
  const doc = base
  leaves.forEach((leaf, index) => {
    setPath(doc, leaf.path, sentinelFor(leaf, index, source))
  })
  return doc
}

/**
 * Fields `toXFormValues` exposes that the schema deliberately doesn't validate.
 * These are owned by the account profile rather than the form: RegistrationForm
 * re-pins them from `values` on every save so a form value can never overwrite
 * them. Anything else showing up here is unintentional - superforms would drop
 * it during validation, so it would never reach Firestore.
 */
const REGISTRATION_UNVALIDATED_FIELDS = [
  'personal.parentFirstName',
  'personal.parentLastName',
]
const APPLICATION_UNVALIDATED_FIELDS: string[] = []

/**
 * Fields `ownedFields` sources from the last-loaded document rather than from
 * what the user typed, because they belong to the account profile and the form
 * never renders them.
 */
const REGISTRATION_IDENTITY_FIELDS = [
  'personal.email',
  'personal.parentFirstName',
  'personal.parentLastName',
]

/**
 * Schema fields ClassDetailsForm validates but deliberately never stores.
 *
 * `confirmation` is the instructor's per-submission acknowledgement: it has to
 * be in the schema to gate the save, and has to stay out of `Data.Class` so a
 * stored `true` can't come back ticked and silently retire the gate. The
 * shared round-trip checks below take a stored document as their input, so
 * they can't speak to a field that is never stored - these two tests cover it
 * instead.
 */
const CLASS_DETAILS_FORM_ONLY_FIELDS = ['confirmation']

/** Stands in for the caller's `serverTimestamp()` sentinel. */
const TIMESTAMP = { __serverTimestamp: true }

const REGISTRATION_FORM = {
  label: 'registration',
  schema: registrationSchema as unknown as z.ZodTypeAny,
  getDefaults: getRegistrationFormDefaults,
  createEmpty: createEmptyRegistration,
  normalize: (data: any) => normalizeRegistrationData(data),
  toFormValues: (data: any) => toRegistrationFormValues(data),
  unvalidated: REGISTRATION_UNVALIDATED_FIELDS,
  formOnly: [] as string[],
  ownedFields: (values: any, formData: any) =>
    registrationOwnedFields(values, formData, TIMESTAMP) as any,
  adminOwned: REGISTRATION_ADMIN_OWNED_FIELDS,
  identity: REGISTRATION_IDENTITY_FIELDS,
}

const APPLICATION_FORM = {
  label: 'application',
  schema: applicationSchema as unknown as z.ZodTypeAny,
  getDefaults: getApplyFormDefaults,
  createEmpty: createEmptyApplication,
  normalize: (data: any) => normalizeApplicationData(data),
  toFormValues: (data: any) => toApplyFormValues(data),
  unvalidated: APPLICATION_UNVALIDATED_FIELDS,
  formOnly: [] as string[],
  ownedFields: (values: any, formData: any) =>
    applicationOwnedFields(values, formData, TIMESTAMP) as any,
  adminOwned: APPLICATION_ADMIN_OWNED_FIELDS,
  identity: [] as string[],
}

/**
 * ClassDetailsForm has a shorter pipeline than the other two: `Data.Class` is
 * flat, there's no normalize step, and the save is a plain
 * `{ ...values, ...formVal.data }` spread rather than an `ownedFields`
 * allowlist - so it takes the shared checks below but not the `ownedFields`
 * block.
 *
 * `getDefaultClassValues` serves as both the defaults factory and the empty
 * document factory here.
 */
const CLASS_DETAILS_FORM = {
  label: 'class details',
  schema: classDetailsFormSchema as unknown as z.ZodTypeAny,
  getDefaults: getDefaultClassValues,
  createEmpty: getDefaultClassValues,
  normalize: (data: any) => data,
  toFormValues: (data: any) => toClassFormValues(data),
  unvalidated: [] as string[],
  formOnly: CLASS_DETAILS_FORM_ONLY_FIELDS,
}

describe('Form field parity', () => {
  describe.each([REGISTRATION_FORM, APPLICATION_FORM, CLASS_DETAILS_FORM])(
    '$label',
    ({
      schema,
      getDefaults,
      createEmpty,
      normalize,
      toFormValues,
      unvalidated,
      formOnly,
    }) => {
      // Split rather than filtered away: the stored-document checks below run
      // over `leaves`, and `formOnlyLeaves` gets its own assertions so a
      // form-only field can't just quietly opt out of all coverage.
      const allLeaves = schemaLeaves(schema)
      const leaves = allLeaves.filter((leaf) => !formOnly.includes(leaf.path))
      const formOnlyLeaves = allLeaves.filter((leaf) =>
        formOnly.includes(leaf.path),
      )

      test('the schema walker finds a non-trivial set of fields', () => {
        // Cheap canary: if `schemaLeaves` ever silently returns nothing, every
        // other test in this block would vacuously pass.
        expect(allLeaves.length).toBeGreaterThan(10)
      })

      test('every declared form-only field is actually in the schema', () => {
        // Stops the exemption list from outliving the field it exempts and
        // silently excusing nothing.
        expect(formOnlyLeaves.map((leaf) => leaf.path).sort()).toEqual(
          [...formOnly].sort(),
        )
      })

      // `test.each([])` is a Jest error and most forms declare none, so the
      // case is skipped rather than absent - a form that grows one starts
      // being checked without anything else changing.
      const eachFormOnly = formOnlyLeaves.length
        ? test.each(formOnlyLeaves)
        : test.skip.each([{ path: '(none)', kind: 'boolean' } as Leaf])
      eachFormOnly(
        'form-only field $path is validated but never stored',
        ({ path }) => {
          expect(hasPath(createEmpty(), path)).toBe(false)
        },
      )

      test.each(leaves)(
        'schema field $path has a default in the form defaults factory',
        ({ path }) => {
          expect(hasPath(getDefaults(), path)).toBe(true)
        },
      )

      test.each(leaves)(
        'schema field $path exists in the empty document factory',
        ({ path }) => {
          expect(hasPath(createEmpty(), path)).toBe(true)
        },
      )

      test('every schema field survives normalize -> toFormValues', () => {
        const populated: any = createEmpty()
        const sentinels = new Map<string, any>()
        leaves.forEach((leaf, index) => {
          const sentinel = sentinelFor(leaf, index)
          sentinels.set(leaf.path, sentinel)
          setPath(populated, leaf.path, sentinel)
        })

        const formValues = toFormValues(normalize(populated))

        for (const [path, sentinel] of sentinels) {
          expect({ path, value: getPath(formValues, path) }).toEqual({
            path,
            value: sentinel,
          })
        }
      })

      test('toFormValues exposes no field the schema does not validate', () => {
        const exposed = objectLeaves(toFormValues(createEmpty()))
        const validated = new Set(allLeaves.map((leaf) => leaf.path))
        const extras = exposed.filter(
          (path) => !validated.has(path) && !unvalidated.includes(path),
        )
        expect(extras).toEqual([])
      })
    },
  )
})

/**
 * Only the two forms whose save path goes through an `ownedFields` allowlist.
 * ClassDetailsForm writes a plain `{ ...values, ...formVal.data }` spread over a
 * flat document, so there's no allowlist to drift out of step with the schema.
 */
describe.each([REGISTRATION_FORM, APPLICATION_FORM])(
  '$label ownedFields',
  ({
    schema,
    createEmpty,
    toFormValues,
    ownedFields,
    adminOwned,
    identity,
  }) => {
    const leaves = schemaLeaves(schema)

    /**
     * Runs `ownedFields` with the last-loaded document and the live form values
     * populated from different sentinel sets, so each assertion can tell which
     * side a written value actually came from.
     */
    const runOwnedFields = () =>
      ownedFields(
        populate(createEmpty(), leaves, 'values'),
        populate(toFormValues(createEmpty()), leaves, 'form'),
      )

    // Every save after the bootstrap write is a `{ merge: true }` write, so
    // `ownedFields` output is literally what reaches Firestore: a field
    // missing from it keeps whatever the last writer left, with no error.
    describe('ownedFields', () => {
      test('writes every schema field the form is allowed to own', () => {
        const written = runOwnedFields()
        const missing = leaves
          .filter((leaf) => !adminOwned.includes(leaf.path))
          .filter((leaf) => !hasPath(written, leaf.path))
          .map((leaf) => leaf.path)
        expect(missing).toEqual([])
      })

      test('takes each of those fields from the form, not the stored copy', () => {
        const written = runOwnedFields()
        const wrong = leaves
          .filter(
            (leaf) =>
              !adminOwned.includes(leaf.path) && !identity.includes(leaf.path),
          )
          .filter((leaf, index) => {
            const expected = sentinelFor(leaf, index, 'form')
            return (
              JSON.stringify(getPath(written, leaf.path)) !==
              JSON.stringify(expected)
            )
          })
          .map((leaf) => leaf.path)
        expect(wrong).toEqual([])
      })

      test('re-pins account-owned identity fields from the stored copy', () => {
        const values = populate(createEmpty(), leaves, 'values')
        const formData = populate(toFormValues(createEmpty()), leaves, 'form')
        // Not every identity field is a schema field - parentFirstName and
        // parentLastName are deliberately unvalidated - so `populate` won't
        // have reached them. Set both sides here instead.
        for (const path of identity) {
          setPath(values, path, `values-${path}`)
          setPath(formData, path, `form-${path}`)
        }

        const written = ownedFields(values, formData)

        for (const path of identity) {
          expect({ path, value: getPath(written, path) }).toEqual({
            path,
            value: `values-${path}`,
          })
        }
      })

      test('never writes an admin-owned field', () => {
        const written = runOwnedFields()
        const leaked = adminOwned.filter((path) => hasPath(written, path))
        expect(leaked).toEqual([])
      })

      test('never writes meta, which admin and the submit handler own', () => {
        expect(runOwnedFields().meta).toBeUndefined()
      })

      test('preserves an existing created timestamp and always stamps updated', () => {
        const existing = { __existingCreated: true }
        const values: any = createEmpty()
        values.timestamps.created = existing

        expect(
          ownedFields(values, toFormValues(createEmpty())).timestamps,
        ).toEqual({ created: existing, updated: TIMESTAMP })
        expect(
          ownedFields(createEmpty(), toFormValues(createEmpty())).timestamps,
        ).toEqual({ created: TIMESTAMP, updated: TIMESTAMP })
      })
    })
  },
)
