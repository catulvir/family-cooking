import { useEffect, useState } from 'react'
import { recipesApi, type Recipe, type RecipeTag } from './api/recipes'
import type { RecipeLink } from './api/dishes'
import RecipeForm from './RecipeForm'
import TagManagement from './TagManagement'
import RecipeLibrary from './RecipeLibrary'
import RecipeDetail from './RecipeDetail'
import useRecipeTagCatalogue from './useRecipeTagCatalogue'
import useRecipeDiscovery from './useRecipeDiscovery'
import { messageFrom } from './errors'

type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: string; recipe?: Recipe }
  | { kind: 'form'; recipe?: Recipe }

export default function Recipes({
  active,
  isAdmin,
  onRecord,
}: {
  active: boolean
  isAdmin: boolean
  onRecord?: (recipe: RecipeLink) => void
}) {
  const [managingTags, setManagingTags] = useState(false)
  const [tagsVisited, setTagsVisited] = useState(false)
  const { tagState, refreshAfterSave } = useRecipeTagCatalogue()
  const manageTags = () => {
    tagState.retry()
    setTagsVisited(true)
    setManagingTags(true)
  }
  const [view, setView] = useState<View>({ kind: 'list' })
  const discovery = useRecipeDiscovery()
  const [detailError, setDetailError] = useState('')
  const [notice, setNotice] = useState('')

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

  const open = (id: string) => {
    tagState.retry()
    setNotice('')
    setDetailError('')
    setView({ kind: 'detail', id })
  }
  const back = () => {
    setNotice('')
    setView({ kind: 'list' })
  }
  const reloadList = discovery.reload
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
        <section className="journal" aria-labelledby={`recipes-${view.kind}-title`}>
          {isAdmin && view.kind !== 'form' && (
            <button className="secondary" data-return="manage-tags" onClick={manageTags}>
              Manage tags
            </button>
          )}
          <output>{notice}</output>
          {view.kind === 'list' && (
            <RecipeLibrary
              discovery={discovery}
              tagState={tagState}
              onNew={() => {
                tagState.retry()
                setNotice('')
                setView({ kind: 'form' })
              }}
              onRetry={reloadList}
              onOpen={open}
              onPageChange={discovery.changePage}
            />
          )}
          {view.kind === 'detail' && (
            <RecipeDetail
              onRecord={onRecord}
              recipe={view.recipe}
              error={detailError}
              onBack={back}
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
              setManagingTags(false)
            }}
          />
        </div>
      )}
    </>
  )
}
