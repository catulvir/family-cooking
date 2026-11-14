import { useEffect, useState } from 'react'
import { recipesApi, type RecipePage, type RecipeQuery } from './api/recipes'
import { messageFrom } from './errors'

export default function useRecipeDiscovery() {
  const [query, setQuery] = useState<RecipeQuery>({
    q: '',
    tagIds: [],
    sort: 'name_asc',
    page: 0,
    size: 20,
  })
  const [searchText, setSearchText] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [response, setResponse] = useState<{
    query: RecipeQuery
    results: RecipePage | null
    error: string
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    recipesApi
      .list(query)
      .then((results) => {
        if (cancelled) return
        if (query.page > 0 && query.page >= results.totalPages) {
          setQuery((current) =>
            current === query ? { ...query, page: Math.max(0, results.totalPages - 1) } : current,
          )
          return
        }
        setResponse({ query, results, error: '' })
      })
      .catch((reason) => {
        if (!cancelled) setResponse({ query, results: null, error: messageFrom(reason) })
      })
    return () => {
      cancelled = true
    }
  }, [query])
  // A response belongs to one exact request. Changing criteria or refreshing
  // immediately hides previous results, even before the effect starts fetching.
  const current = response?.query === query ? response : null
  const setCriteria = (criteria: Partial<Pick<RecipeQuery, 'q' | 'tagIds' | 'sort'>>) =>
    setQuery((previous) => ({ ...previous, ...criteria, page: 0 }))
  return {
    query,
    searchText,
    setSearchText,
    filtersOpen,
    setFiltersOpen,
    results: current?.results ?? null,
    loading: !current,
    error: current?.error ?? '',
    setCriteria,
    search: () => {
      const q = searchText.trim()
      setSearchText(q)
      setCriteria({ q })
    },
    clearAll: () => {
      setSearchText('')
      setCriteria({ q: '', tagIds: [] })
    },
    changePage: (page: number) => setQuery((previous) => ({ ...previous, page })),
    reload: () => setQuery((previous) => ({ ...previous })),
  }
}

export type RecipeDiscoveryState = ReturnType<typeof useRecipeDiscovery>
