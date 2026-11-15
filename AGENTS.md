# Project instructions

## Backend code organization

- Generally split backend DTOs, repositories, services, and controllers into separate files within their domain module, following neighboring code (for example, `RecipeTagDtos.kt`, `RecipeTagRepository.kt`, `RecipeTagService.kt`, and `RecipeTagController.kt`).
- Keep related request/response types and small supporting types together when useful; avoid combining the persistence, business logic, and HTTP layers in a single file.

## Verification timing

- Run browser smoke checks and extensive frontend test suites only during the final step of a milestone, or when the user explicitly requests them earlier.
- During earlier milestone steps, use targeted tests for the behaviour being changed, including the failing-test / implementation / refactoring cycle. Do not run the full frontend suite or broad browser review by default.
- This timing rule does not defer backend verification, migration checks, or focused frontend lint/type/build checks needed for the current change.
- Record verification actually performed and any checks deferred to the final milestone step. Do not describe deferred checks as passed.

This project-wide rule applies to all milestones. For milestone 6, the final verification step is 6.6.

## Navigation focus

- Do not automatically move focus to a heading, field, or return control when opening or returning to a view. Do not simulate this behavior with a focus highlight on arrival.
- Keep visible keyboard focus and deliberate focus handling for actions within the current view, such as validation errors, row editing, and discard confirmations.
