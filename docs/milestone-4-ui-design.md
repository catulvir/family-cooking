# Milestone 4 — UI design agreement

Status: design direction accepted, 2026-11-08. The initial UI implementation and remaining work belong to [Milestone 5](milestone-5-plan.md). This document retains the original design reference; milestone 5 preserves the newer meal terminology and optional location field.

Reference: the three Canva sketches supplied in chat (welcome, profile/home, recipe search). Their cream, terracotta, green, botanical decoration, and circular thumbnails define the visual direction.

## Product decisions

- Keep private, administrator-created family accounts. The welcome page offers Log in and explains how to obtain an account; public Sign up is omitted.
- Distinguish a recipe (reusable instructions) from a dish (one dated cooking event). Recording a dish never requires a recipe.
- Home is the shared family overview. Profile is personal settings, reached through the avatar/account menu.
- Proposed collection ownership: Seasonal favourites and Family favourites are shared, curated by administrators. Personal favourites belong to the signed-in member. Confirm this assumption during design review.
- Replace Top meals with Family favourites initially. There is no computed ranking or implication that private reviews are public.
- Use Lucide as the initial icon choice with the existing custom React/CSS UI. Revisit MUI Rounded only if adopting MUI components. No dependency is installed in this milestone.
- Preserve existing edit permissions: dish creators can edit their entries; administrators can edit all entries.

## Navigation and delivery boundaries

Final navigation: Home, Journal, Recipes, account menu. The account menu contains Profile, Family accounts (administrators only), and Sign out.

Milestone 5 exposes Journal and the account menu with currently supported actions. Journal is the initial signed-in destination. Recipes arrives in milestone 6, Profile in milestone 7, and the curated Home in milestone 8. Do not expose dead navigation or sample collections as real data.

## Visual system

| Element | Proposed treatment |
| --- | --- |
| Canvas | Warm cream, starting reference #F6F1E7 |
| Panels | White or warm white, generous spacing, rounded corners |
| Primary text and headings | Deep green, starting reference #163D2B |
| Accent | Terracotta, starting reference #CF7954; dark text on pale/accent fills |
| Secondary panels | Pale peach, starting reference #F1D7CA |
| Headings | Georgia initially; botanical display lettering reserved for decorative artwork |
| Body and controls | System sans-serif; 16px baseline, comfortable line height |
| Spacing | 4/8/12/16/24/32/48px scale |
| Shapes | 24px panel radius, 12px field radius, pill buttons and compact recipe rows |
| Icons | One consistent outline family, 20–24px visuals, at least 44px action targets |
| Photos | Circular thumbnails in compact collections; larger landscape image on recipe detail |

These are starting tokens, not contrast-certified final values. Check text, control boundaries, focus, hover, and disabled states during implementation. Do not rely on colour alone for selection or validation.

Botanical artwork frames the welcome page. Interior screens use restrained corner accents outside reading and interaction areas. Decorative images are ignored by assistive technology. Recipe and avatar placeholders work without uploaded photos. Use supplied/exported or appropriately licensed assets; do not ship screenshots as the interface.

## Screen sketches

These wireframes specify hierarchy and flow; colours and imagery follow the visual system above.

### Welcome and access

```text
  Botanical border on cream
  ┌─────────────────────────────────────────┐
  │                Chef motif               │
  │          Family Cooking Tracker         │
  │               By Rozbergs               │
  │       Your family's private cookbook    │
  │                                         │
  │ Email       [                         ] │
  │ Password    [                         ] │
  │                 [ Log in ]              │
  │ Ask the family administrator for access.│
  └─────────────────────────────────────────┘
```

Keep the form on the welcome page to avoid an unnecessary extra click. First-time users see the required password-change form before any protected navigation. Login failures appear next to the form and preserve the email input.

### Home — milestone 8

```text
 [Family Cooking]  Home  Journal  Recipes       [Avatar ▾]
 Welcome back, Name                         [Record a dish]

 ┌ Seasonal favourites ───── [Manage] ┐ ┌ Family favourites ── [Manage] ┐
 │ ○ Pumpkin soup                    │ │ ○ Okonomiyaki                 │
 │   Soup · Comfort food             │ │   Japanese · Savoury          │
 │ ○ Seasonal poké                   │ │ ○ Nyastya's curry              │
 │ [View all]                        │ │ [View all]                     │
 └───────────────────────────────────┘ └───────────────────────────────┘
 Recently cooked                                      [View journal]
 ○ Oladushki             Prepared 8 November            [View dish]
```

Manage is visible only to collection editors and opens membership/order controls. Add recipe inside that view selects an existing recipe. Editing the underlying recipe is a separate action on its detail screen. Personal favourites are available through a Recipes filter.

### Recipe library — milestone 6

```text
 [Family Cooking]  Journal  Recipes                    [Account ▾]
 Recipes                                            [+ New recipe]
 [Search recipes by name                         🔍] [Sort: A–Z ▾]
 Selected: [Dessert ×] [Sweet ×]                       [Clear all]
 12 recipes
 ┌ Results ──────────────────────────┐ ┌ Filters ─────────────────┐
 │ ○ Oladushki                       │ │ Meal type: [Dessert ✓]   │
 │   Dessert · Sweet · Comfort food   │ │ Cuisine:   [Japanese]    │
 │ ○ Another recipe                  │ │ Style:     [Comfort food]│
 │ [Previous] Page 1 of 2 [Next]      │ │ [My favourites] (M8)     │
 └───────────────────────────────────┘ └──────────────────────────┘
```

Search matches recipe names. Proposed filter semantics: OR within a group, AND between groups; name search further narrows results. Explain this in filter help text. Tags use consistent names, without hashtag punctuation. Ingredients become a separate filter group in milestone 9. Changing search or filters resets pagination. Returning from detail preserves search, filters, sorting, and page.

### Recipe detail and editing — milestone 6

```text
 [Back to recipes]
 Pumpkin soup                           [Edit recipe] [Favourite: M8]
 [Photo / placeholder: M7]               Soup · Comfort food
 Servings: 4
 Ingredients                            Instructions
 • Quantity / unit / ingredient         1. Prepare the vegetables…
 • Quantity / unit / ingredient         2. Cook…
                                        3. Blend…
 [Record cooking this recipe]
```

Create/edit fields: name, servings, ingredient rows, ordered instructions, tags, optional notes. Ingredient rows can be added, removed, and reordered using labelled controls. Save validates required content; Cancel prompts only when there are unsaved changes. Recipe ownership/edit permissions need to be specified with milestone 6 before implementation.

Record cooking preselects the recipe and suggests its name. It creates a separate dish with its own date and notes. Editing a recipe does not rewrite historical dish records.

### Journal and recording a dish — milestone 5

Journal rows show dish name and preparation date; selecting a row opens dish detail. Use the same panel, type, and button system as Recipes. Preserve the current date ordering.

The form contains Dish name, Preparation date, optional Preparation notes, Save dish, and Cancel. Optional recipe selection arrives in milestone 6. Keep dates and notes readable; date input labels remain visible. Dish detail shows Edit only when authorized. Family account management moves into a separate administrator view with its existing temporary-password flow.

## Mobile and interaction states

- At narrow widths, use a compact header with labelled navigation and an account button. Avoid hover-only actions.
- Stack collections, ingredients/instructions, and form fields. Collapse filter options behind a Filters button with a selected count; keep selected chips visible above results.
- Target usable layouts at 360px, 768px, and 1280px, including long names and 200% zoom. Content must reflow without horizontal page scrolling.
- Loading uses a short status or skeleton; empty journal offers Record a dish; an empty recipe library offers New recipe. No search matches offers Clear filters and preserves the query.
- Saving prevents duplicate submission. Failed saves retain all input and show a retryable message. Inline validation links errors to fields and focuses the first invalid field.
- After modal/drawer dismissal, focus returns to its trigger; Escape closes dismissible overlays. Every icon-only control has an accessible name. Active navigation is identifiable without colour.
- Distinguish an expired session from a network failure. Preserve unsaved work where practical and explain the recovery action.

## Acceptance scenarios and TDD handoff

Milestone 4 creates specifications only. These scenarios are not executable tests and have not passed. For each implementation slice, first add a behaviour test that fails for the missing capability, implement the smallest change, then refactor with the suite green. Keep existing authentication and journal regression coverage. Avoid tests that assert CSS class names or mirror component internals.

| ID / milestone | Given / when | Expected behaviour |
| --- | --- | --- |
| A1 / M5 | Signed-out visitor opens the app | Login is visible; protected navigation and public registration are absent. |
| A2 / M5 | User must change their temporary password | Required password change precedes access to journal/navigation. |
| A3 / M5 | Member or administrator opens account navigation | Only the administrator has Family accounts access; server authorization remains enforced. |
| J1 / M5 | User records a valid dated dish | Saving once creates one entry, opens its detail, and preserves journal ordering. |
| J2 / M5 | Dish save fails | Values remain available, an error is announced, and retry is possible. |
| J3 / M5 | Creator, another member, or administrator opens a dish | Edit availability and server permission match the existing ownership policy. |
| N1 / M5 | User navigates journal/detail/form and returns | Navigation is predictable; cancelling does not create or overwrite a dish. |
| R1 / M6 | User searches and combines tags | Results follow the documented group semantics; clearing filters updates results. |
| R2 / M6 | User opens a result and returns | Query, selected filters, sort order, and page are retained. |
| R3 / M6 | User records cooking from a recipe | A separate dated dish is created; the recipe remains reusable and unchanged. |
| P1 / M7 | Unauthorized request targets a private photo | Access is denied; authorized users see the image or a useful fallback. |
| C1 / M8 | Collection editor adds an existing recipe | Collection membership changes without modifying the recipe. |
| C2 / M8 | A member favourites a recipe | Their preference persists without changing another member's favourites. |
| U1 / each UI slice | Keyboard-only user completes the flow | All actions, focus movement, validation, and dismissals are usable. |

Use frontend interaction tests for user behaviour and API/integration tests for permissions and persistence. Use manual viewport, zoom, and keyboard review for layout and usability. Automated screenshots can supplement these checks once the appearance is accepted.

## Review and exit criteria

- Review the shared-versus-personal collection ownership assumption and the proposed filter semantics.
- Review desktop and mobile hierarchy, including the retained journal workflow.
- Accept visual tokens and icon direction before milestone 5 implementation.
- Milestone 4 is ready for review when these specifications and scenarios are available; it is complete when the design decisions are accepted. No implementation, dependency installation, commit, or push is required here.
