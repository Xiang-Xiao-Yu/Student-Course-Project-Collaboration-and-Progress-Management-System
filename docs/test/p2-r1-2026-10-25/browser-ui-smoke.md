# Browser UI smoke evidence

Run against the PR #30 renderer build, a temporary SQLite database initialized from all four checked-in migrations, and the PR #28 Nest API on localhost. The temporary database contained only test-created accounts and a test project.

## Unsaved project archive

1. Registered a temporary owner account and created a project in the renderer.
2. Advanced the project from planning to in progress and then completed.
3. Changed the project name without saving, opened the archive confirmation, and confirmed.
4. The page showed `请先保存或撤销未保存的项目资料，再归档。`; the edited project name remained in the field and the project stayed completed.
5. Saved the draft, archived the project, and confirmed the page showed `项目已归档，仅可查看信息或删除项目。` with status `已归档`.

## Non-member direct route

1. Registered and signed in with a separate temporary account that was not a member of the test project.
2. Opened the members route directly by project ID.
3. The renderer showed `无法访问项目` and `项目不存在或无权访问`; it did not display the members page.

The CUA screenshot of the denied page showed the `无法访问项目` error panel; the text state above is saved here as reviewable evidence. The automated Electron harness was not run because Electron and Playwright were absent; its source syntax check passed. The current P2 unit test covers the projectId-keyed route state, and the harness now asserts that the outsider does not issue a member-list request.
