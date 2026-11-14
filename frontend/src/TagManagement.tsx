import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FormikProvider, useFormik } from 'formik'
import * as yup from 'yup'
import {
  RecipeApiError,
  recipeTagsApi,
  tagGroups,
  type RecipeTag,
  type TagGroup,
} from './api/recipes'
import { AppForm, FormError, FormField } from './forms'
import { CatalogueFeedback, type CatalogueState } from './RecipeTags'
import { messageFrom } from './errors'

const normalize = (name: string) => name.replace(/\s+/gu, ' ').trim()
const schema = yup.object({
  name: yup
    .string()
    .transform(normalize)
    .required('Enter a tag name.')
    .max(50, 'Use at most 50 characters.')
    .matches(/^[^#]*$/, 'Use a name without hashtag punctuation.'),
  group: yup.string().oneOf(Object.keys(tagGroups)).required(),
})

export default function TagManagement({
  active,
  state,
  onBack,
  onSaved,
}: {
  active: boolean
  state: CatalogueState
  onBack: () => void
  onSaved: (tag: RecipeTag) => void
}) {
  const [editing, setEditing] = useState<RecipeTag | null>(null)
  const [notice, setNotice] = useState('')
  const [replacement, setReplacement] = useState<{ tag: RecipeTag | null } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const editor = useRef<HTMLDivElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const focusAfterRender = useRef<'name' | 'trigger' | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const formik = useFormik({
    initialValues: { name: '', group: 'MEAL_TYPE' as TagGroup },
    validationSchema: schema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values, helpers) => {
      setNotice('')
      try {
        const tag = editing
          ? await recipeTagsApi.rename(editing.id, normalize(values.name))
          : await recipeTagsApi.create(normalize(values.name), values.group)
        if (!mounted.current) return
        onSaved(tag)
        setEditing(null)
        helpers.resetForm({ values: { name: '', group: values.group } })
        setNotice('Tag saved.')
        focusAfterRender.current = 'name'
      } catch (reason) {
        if (!mounted.current) return
        helpers.setStatus(messageFrom(reason))
        if (reason instanceof RecipeApiError) helpers.setErrors(reason.fieldErrors)
      }
    },
  })
  useLayoutEffect(() => {
    if (active) heading.current?.focus()
  }, [active])
  useLayoutEffect(() => {
    if (formik.isSubmitting || replacement || !focusAfterRender.current) return
    const target =
      focusAfterRender.current === 'name' ? editor.current?.querySelector('input') : trigger.current
    focusAfterRender.current = null
    if (active) target?.focus()
  })
  useEffect(() => {
    if (replacement && active) keep.current?.focus()
  }, [replacement, active])
  const replace = (tag: RecipeTag | null) => {
    setEditing(tag)
    setReplacement(null)
    setNotice('')
    formik.resetForm({ values: { name: tag?.name ?? '', group: tag?.group ?? 'MEAL_TYPE' } })
    focusAfterRender.current = 'name'
  }
  const requestReplace = (tag: RecipeTag | null, target: HTMLElement) => {
    if (formik.isSubmitting) return
    trigger.current = target
    if (formik.dirty) setReplacement({ tag })
    else replace(tag)
  }
  const keepEditing = () => {
    focusAfterRender.current = 'trigger'
    setReplacement(null)
  }
  return (
    <section className="management" aria-labelledby="tags-title">
      <button className="secondary" disabled={formik.isSubmitting} onClick={onBack}>
        Back to recipe
      </button>
      <h2 id="tags-title" ref={heading} tabIndex={-1}>
        Manage tags
      </h2>
      <p>
        Create or rename tags for the family. A tag keeps its group and existing recipe selections
        when renamed.
      </p>
      <output>{notice}</output>
      <div ref={editor}>
        <FormikProvider value={formik}>
          <AppForm disabled={!!replacement}>
            <fieldset className="recipe-fields" disabled={formik.isSubmitting || !!replacement}>
              <legend>{editing ? `Rename ${editing.name}` : 'New tag'}</legend>
              <FormField name="name" label="Tag name" maxLength={50} />
              {editing ? (
                <p>Group: {tagGroups[editing.group]}</p>
              ) : (
                <FormField name="group" label="Tag group" as="select">
                  {(Object.keys(tagGroups) as TagGroup[]).map((group) => (
                    <option key={group} value={group}>
                      {tagGroups[group]}
                    </option>
                  ))}
                </FormField>
              )}
              <div className="form-actions">
                <button disabled={formik.isSubmitting}>
                  {formik.isSubmitting ? 'Saving…' : editing ? 'Save tag' : 'Create tag'}
                </button>
                {(editing || formik.dirty) && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={(event) => requestReplace(null, event.currentTarget)}
                  >
                    Cancel tag edit
                  </button>
                )}
              </div>
            </fieldset>
            <FormError />
          </AppForm>
        </FormikProvider>
      </div>
      {replacement && (
        <section aria-label="Unsaved tag changes">
          <p>Discard your unsaved tag changes?</p>
          <div className="form-actions">
            <button
              ref={keep}
              onClick={keepEditing}
              onKeyDown={(event) => {
                if (event.key === 'Escape') keepEditing()
              }}
            >
              Keep editing
            </button>
            <button
              className="secondary"
              onClick={() => replace(replacement.tag)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') keepEditing()
              }}
            >
              Discard changes
            </button>
          </div>
        </section>
      )}
      <CatalogueFeedback {...state} />
      {state.catalogue &&
        (Object.keys(tagGroups) as TagGroup[]).map((group) => (
          <section key={group} aria-label={tagGroups[group]}>
            <h3>{tagGroups[group]}</h3>
            <ul className="managed-tags">
              {state.catalogue![group].map((tag) => (
                <li key={tag.id}>
                  <span>{tag.name}</span>
                  <button
                    className="secondary"
                    disabled={formik.isSubmitting || !!replacement}
                    aria-label={`Rename ${tag.name}`}
                    onClick={(event) => requestReplace(tag, event.currentTarget)}
                  >
                    Rename
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </section>
  )
}
