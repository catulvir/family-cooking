import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { recipesApi, type Recipe, type RecipePage, type RecipeTag } from './api/recipes'
import RecipeForm from './RecipeForm'
import TagManagement from './TagManagement'
import RecipeLibrary from './RecipeLibrary'
import RecipeDetail from './RecipeDetail'
import useRecipeTagCatalogue from './useRecipeTagCatalogue'
import { messageFrom } from './errors'

type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: string; recipe?: Recipe }
  | { kind: 'form'; recipe?: Recipe }

export default function Recipes({ active, isAdmin }: { active: boolean; isAdmin: boolean }) {
  const [managingTags, setManagingTags] = useState(false)
  const [tagsVisited, setTagsVisited] = useState(false)
  const { tagState, refreshAfterSave } = useRecipeTagCatalogue()
  const manageTags = () => {
    tagState.retry()
    setTagsVisited(true)
    setManagingTags(true)
  }
  const [view, setView] = useState<View>({ kind: 'list' })
  const [listRequest, setListRequest] = useState({ page: 0, revision: 0 })
  const page = listRequest.page
  const [results, setResults] = useState<RecipePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [notice, setNotice] = useState('')
  const region = useRef<HTMLElement>(null)
  const returnTarget = useRef<string | null>(null)

  useEffect(() => {
    const requestedPage = listRequest.page
    let cancelled = false
    recipesApi
      .list(requestedPage)
      .then((data) => {
        if (cancelled) return
        if (requestedPage > 0 && requestedPage >= data.totalPages) {
          setListRequest((current) => ({ ...current, page: Math.max(0, data.totalPages - 1) }))
          return
        }
        setResults(data)
        setLoading(false)
      })
      .catch((reason) => {
        if (!cancelled) {
          setListError(messageFrom(reason))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [listRequest])

  useEffect(() => {
    if (view.kind !== 'detail' || view.recipe) return
    let cancelled = false
    recipesApi
      .get(view.id)
      .then((recipe) => {
        if (!cancelled) {
          setDetailError('')
          setView({ kind: 'detail', id: recipe.id, recipe })
        }
      })
      .catch((reason) => {
        if (!cancelled) setDetailError(messageFrom(reason))
      })
    return () => {
      cancelled = true
    }
  }, [view])

  useLayoutEffect(() => {
    if (!active || managingTags) return
    const target = returnTarget.current
      ? region.current?.querySelector<HTMLElement>(`[data-return="${returnTarget.current}"]`)
      : null
    ;(target ?? region.current?.querySelector<HTMLElement>(`#recipes-${view.kind}-title`))?.focus()
    if (target || view.kind !== 'detail' || view.recipe) returnTarget.current = null
  }, [active, view, managingTags])

  const open = (id: string) => {
    tagState.retry()
    setNotice('')
    setDetailError('')
    setView({ kind: 'detail', id })
  }
  const back = (id: string) => {
    returnTarget.current = id
    setNotice('')
    setView({ kind: 'list' })
  }
  const reloadList = () => {
    setLoading(true)
    setListError('')
    setListRequest((current) => ({ ...current, revision: current.revision + 1 }))
  }
  const changePage = (next: number) => {
    // Move focus to a stable anchor before the paging controls unmount. Loading
    // and request completion can then leave focus alone, even after navigation.
    region.current?.querySelector<HTMLElement>('#recipes-list-title')?.focus()
    setLoading(true)
    setListError('')
    setResults(null)
    setListRequest((current) => ({ ...current, page: next }))
  }
  const saved = (recipe: Recipe) => {
    setNotice('Recipe saved.')
    setDetailError('')
    setView({ kind: 'detail', id: recipe.id, recipe })
    reloadList()
  }
  const tagSaved = (tag: RecipeTag) => {
    refreshAfterSave(tag)
    setView((current) =>
      current.kind !== 'list' && current.recipe
        ? {
            ...current,
            recipe: {
              ...current.recipe,
              tags: current.recipe.tags?.map((selected) =>
                selected.id === tag.id ? tag : selected,
              ),
            },
          }
        : current,
    )
    reloadList()
  }

  return (
    <>
      <div hidden={managingTags}>
        <section ref={region} className="journal" aria-labelledby={`recipes-${view.kind}-title`}>
          {isAdmin && view.kind !== 'form' && (
            <button className="secondary" data-return="manage-tags" onClick={manageTags}>
              Manage tags
            </button>
          )}
          <output>{notice}</output>
          {view.kind === 'list' && (
            <RecipeLibrary
              page={page}
              results={results}
              loading={loading}
              error={listError}
              onNew={() => {
                tagState.retry()
                setNotice('')
                setView({ kind: 'form' })
              }}
              onRetry={reloadList}
              onOpen={open}
              onPageChange={changePage}
            />
          )}
          {view.kind === 'detail' && (
            <RecipeDetail
              recipe={view.recipe}
              error={detailError}
              onBack={() => back(view.id)}
              onRetry={() => {
                setDetailError('')
                setView({ kind: 'detail', id: view.id })
              }}
              onEdit={() => {
                setNotice('')
                setView({ kind: 'form', recipe: view.recipe })
              }}
            />
          )}
          {view.kind === 'form' && (
            <RecipeForm
              recipe={view.recipe}
              active={active && !managingTags}
              tagState={tagState}
              onManageTags={isAdmin ? manageTags : undefined}
              onSaved={saved}
              onReloaded={(recipe) => {
                setNotice('Latest recipe loaded.')
                setDetailError('')
                setView({ kind: 'detail', id: recipe.id, recipe })
                reloadList()
              }}
              onCancel={() => {
                returnTarget.current = view.recipe ? 'edit' : 'new'
                // Fetch again after leaving an editor, so a conflicting draft can be discarded
                // and reopened against the latest server version.
                if (view.recipe) open(view.recipe.id)
                else setView({ kind: 'list' })
              }}
            />
          )}
        </section>
      </div>
      {tagsVisited && isAdmin && (
        <div hidden={!managingTags}>
          <TagManagement
            active={active && managingTags}
            state={tagState}
            onSaved={tagSaved}
            onBack={() => {
              returnTarget.current = 'manage-tags'
              setManagingTags(false)
            }}
          />
        </div>
      )}
    </>
  )
}
