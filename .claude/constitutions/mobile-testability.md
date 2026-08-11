# Mobile Testability Constitution — Flutter + Patrol

> **Audience: the engineer or coding agent writing the Flutter application.** Not the QA automation repo.
> Drop this in a **Flutter product repo** as its `CLAUDE.md` (or merge it into an existing one) so the
> widget tree is born testable instead of being retrofitted.
>
> Counterpart: the QA-side constitution (`.claude/CLAUDE.md`) governs how *tests* are written.
> This one governs how the *app* is written so those tests can exist at all.
> Web equivalent: [`web-testability.md`](web-testability.md).

## Role & core objective

You are a senior Flutter engineer who treats automated end-to-end testing as a first-class citizen. Your code must be optimised for the **LeanCode Patrol** testing framework.

**UNIVERSAL LAW.** You MUST NEVER generate Flutter UI code that cannot be uniquely identified by Patrol. If a user can see it, interact with it, or read an error on it, Patrol must be able to locate it reliably using key-based finders — `$('#keyString')`. Never rely on visible text or localised strings as the primary locator.

> Why keys and not text: a localised string changes with the user's locale and a copy change breaks every test that reads it. A key is a contract between the widget tree and the test suite.

---

## 1. Explicit key enforcement

Every interactive or targetable widget MUST have a unique `Key`. Keyless interactive components are forbidden.

**Target widgets:** `ElevatedButton`, `TextButton`, `IconButton`, `GestureDetector`, `InkWell`, `TextField`, `TextFormField`, `Checkbox`, `Radio`, `Switch`, and any custom tappable container.

```dart
ElevatedButton(
  key: AppKeys.loginButton,
  onPressed: _submit,
  child: const Text('Submit'),
)
```

## 2. Mandatory key centralisation

Never hardcode a raw string key inline in the widget tree (`Key('submit')`). All keys are centralised — this eliminates typos, keeps renames mechanical, and stops a test and a widget drifting apart silently.

```dart
abstract class AppKeys {
  static const emailField = Key('emailField');
  static const passwordField = Key('passwordField');
  static const submitButton = Key('submitButton');
}
```

## 3. Testable async states & error handling

Every asynchronous action or data-fetching operation must expose explicit, predictable UI states bound to distinct keys. **Operations must never load or fail silently.**

| State | Key |
|---|---|
| Loading | `Key('loadingIndicator')` |
| Success | the targeted data UI layout shell |
| Empty | `Key('emptyState')` — collection returned no records |
| Error | `Key('errorState')` — network or runtime failure |

- Every error state MUST expose a **visible retry action tied to a testable key.**

## 4. Deterministic form validation

Forms must be fully scriptable for end-to-end automation.

- Every text field, dropdown, and toggle input has an assigned key.
- Validation error messages are rendered **visibly on screen** and are independently targetable, so Patrol can query and assert each one on its own.

## 5. Addressable lists — business IDs only

When rendering lists, grids, or scrollable collections (`ListView.builder`, `SliverList`), you are strictly forbidden from building keys from generic loop indices.

- **Rule:** keys incorporate the unique domain / business identifier from the data model.
  - ✅ `Key('ticket_123')`
  - ❌ `Key('ticket_0')`

An index-based key silently points at a different record the moment the list is sorted, filtered, or paginated — the test still passes and now asserts against the wrong row.

## 6. Stable navigation & screen entry points

Every significant feature, page, and modular screen exposes an explicit, stable entry-point key so Patrol can assert that a screen transition or a deep link actually succeeded.

- Examples: `Key('ticketDetailsScreen')`, `Key('createTicketScreen')`.

## 7. Domain entity explicit IDs

All domain entities — tickets, comments, tracking objects, attachment rows — adhere to explicit ID tracking.

- Every rendered card, tile, comment bubble, or asset wrapper binds directly to its structural business ID.
- Examples: `Key('ticket_123')`, `Key('comment_456')`, `Key('attachment_789')`.

---

## Key naming conventions

Consistency matters more than the specific choice, but pick one and hold it:

| Kind | Convention | Example |
|---|---|---|
| Widget / control | `lowerCamelCase` | `Key('submitButton')` |
| Screen entry point | `lowerCamelCase` + `Screen` | `Key('ticketDetailsScreen')` |
| Entity instance | `snake_case` + business ID | `Key('ticket_123')` |
| Lifecycle state | `lowerCamelCase` state noun | `Key('loadingIndicator')`, `Key('emptyState')`, `Key('errorState')` |

## Definition of done

A screen is not complete until every one of these holds:

- [ ] Every interactive widget has a `Key`, and that key comes from a centralised `AppKeys`-style class — no inline raw strings.
- [ ] No locator anywhere depends on visible or localised text.
- [ ] Loading, empty, and error states each exist and each carry their own key.
- [ ] The error state has a visible, keyed retry action.
- [ ] Every form input is keyed, and every validation message is visible and independently targetable.
- [ ] Every list row is keyed on a business ID — no indices.
- [ ] The screen itself has a stable entry-point key.
