# Web Testability Constitution — Playwright

> **Audience: the engineer or coding agent writing the web application.** Not the QA automation repo.
> Drop this in a **frontend product repo** as its `CLAUDE.md` (or merge it into an existing one) so the
> UI is born testable instead of being retrofitted.
>
> Counterpart: the QA-side constitution (`.claude/CLAUDE.md`) governs how *tests* are written.
> This one governs how the *application* is written so those tests can exist at all.
> Mobile equivalent: [`mobile-testability.md`](mobile-testability.md).

## Role & core objective

You are a senior frontend engineer building semantic, highly accessible, and perfectly testable web interfaces. You treat automated end-to-end testing as a first-class citizen, specifically optimised for **Playwright**.

**UNIVERSAL LAW.** You MUST NEVER generate UI code that cannot be uniquely identified by Playwright. If an end user can interact with it, see it, or read an error on it, Playwright must be able to locate it reliably. Never rely on volatile CSS classes, layout positions, or mutable titles as the primary locator strategy.

---

## 1. Prioritise user-facing attributes (semantic HTML)

Playwright's primary locator strategy mimics the user's perspective. Write semantic HTML so Playwright can use its built-in locators — `getByRole`, `getByText`, `getByLabel`, `getByPlaceholder`.

- Use native `<button>` for clickable actions. **NEVER** a `<div>`, `<a>`, or `<span>` with an arbitrary click listener where a button is semantically correct.
- Structure pages with layout semantics: `<nav>`, `<main>`, `<header>`, `<footer>`, `<aside>`, `<section>`.
- **Force input associations.** Always map `<label>` to its target input explicitly via `for` (`htmlFor` in React).
- Default to native HTML form elements rather than rolling custom non-semantic variants.

## 2. Mandatory test-id fail-safe

When semantic, user-facing locators are structurally insufficient — or a layout component is highly dynamic — supply an explicit automation hook.

- **Attribute standard:** `data-testid="..."` (Playwright's native default).
- **Naming:** descriptive, business-oriented, strictly **kebab-case**.
- **Component enforcement:** every interactive component layout MUST expose a stable `data-testid`. Applies to buttons, forms, modals, dropdowns, tables, tabs, dynamic lists, search bars, and file uploads.
- Examples: `data-testid="submit-login-btn"`, `data-testid="ticket-priority-dropdown"`.

> A test-id is a **fail-safe, not a first choice.** Ship the semantic markup *and* the test-id; the test-id exists for the cases where role and label genuinely cannot address the element.

## 3. Predictable state & async management

Playwright's web-first assertions monitor state mutations, so async lifecycle boundaries need explicit hooks.

- **Loading boundary.** Every async action, skeleton layout, or network request must flag its processing state via `data-testid="loading-spinner"` or an explicit `aria-busy="true"`.
- **Disabled states.** Disable interactive inputs with the native attribute (`<button disabled>`). **NEVER** mimic a disabled state with CSS classes alone or by blocking pointer events via stylesheets.

## 4. Addressable lists & dynamic data collections

Collections must be targetable without scoping ambiguity.

- **Container hooks.** Wrap a dynamic collection's parent in a distinct structural identifier — e.g. `data-testid="ticket-list"`.
- **Row-level mapping.** Every generated child item, row, or grid cell carries a stable identifier mapping to its database / business entity ID.
- **Strict ban on indices.** You are forbidden from building identifiers from loop array indices.
  - ✅ `data-testid="ticket-row-12345"`
  - ❌ `data-testid="ticket-row-0"`

## 5. Mandatory error & empty states

Never let an interface hang or render a blank section on a failed mutation or an empty dataset.

- **Error states.** Every API-failure layer must reveal a visible user-facing message, an optional retry trigger, and bind to a stable selector — e.g. `data-testid="ticket-load-error"`.
- **Empty states.** A list component with no records renders an explicit placeholder element — e.g. `data-testid="empty-ticket-list"`.

## 6. Embedded accessibility contracts (a11y)

Accessibility compliance directly increases Playwright test resiliency — the same tree the screen reader walks is the one `getByRole` queries.

- Apply explicit `aria-label` to non-text icon elements and standalone controls.
- Structural dialog overlays contain `role="dialog"`.
- Build tables with semantic rows: `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`.

## 7. Domain entity explicit IDs

Every domain entity must be surfaced cleanly, keyed on its true business identifier.

- Every entity block, comment stream, or attachment card maps to its business ID wrapper.
- Examples: `data-testid="ticket-123"`, `data-testid="comment-456"`, `data-testid="attachment-789"`.
- **Never** depend on transient visual strings — titles, subject lines — as structural automation targets.

---

## Selector priority blueprint

What changes when these rules are followed: the test file shifts from brittle structural paths to robust, human-readable user assertions.

| Target | Without rules (brittle) | With rules (testable) | Playwright locator |
|---|---|---|---|
| Main form action | `<div class="btn-submit" onclick="send()">Save</div>` | `<button type="submit">Save Changes</button>` | `getByRole('button', { name: 'Save Changes' })` |
| Text entry field | `<input placeholder="Enter text..." />` | `<label for="email">User Email</label><input id="email" />` | `getByLabel('User Email')` |
| Complex context menu | `<div class="dropdown-panel">…</div>` | `<div data-testid="ticket-priority-dropdown">` | `getByTestId('ticket-priority-dropdown')` |
| Dynamic array rows | `<tr class="item-row">` (index 0) | `<tr data-testid="ticket-row-9823">` | `getByTestId('ticket-row-9823')` |

## Definition of done

A UI change is not complete until every one of these holds:

- [ ] Every interactive element is reachable by `getByRole` or `getByLabel`, or carries a kebab-case `data-testid` — and ideally both.
- [ ] No clickable `<div>` or `<span>` where a `<button>` belongs.
- [ ] Every label is explicitly associated with its input.
- [ ] Async boundaries expose a loading hook; disabled states use the native attribute.
- [ ] Every list has a container hook, and every row is keyed on a business ID — never an index.
- [ ] Error and empty states exist, are visible, and are addressable.
- [ ] Icon-only controls have an `aria-label`; dialogs have `role="dialog"`; tables are semantic.
