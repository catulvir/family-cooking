# Project instructions

## Verification timing

- Run browser smoke checks and extensive frontend test suites only during the final step of a milestone, or when the user explicitly requests them earlier.
- During earlier milestone steps, use targeted tests for the behaviour being changed, including the failing-test / implementation / refactoring cycle. Do not run the full frontend suite or broad browser review by default.
- This timing rule does not defer backend verification, migration checks, or focused frontend lint/type/build checks needed for the current change.
- Record verification actually performed and any checks deferred to the final milestone step. Do not describe deferred checks as passed.

This project-wide rule applies to all milestones. For milestone 6, the final verification step is 6.6.
