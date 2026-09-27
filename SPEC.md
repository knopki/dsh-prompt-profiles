# @knopki/dsh-prompt-profiles: product specification

## Purpose and goal

Agent presets define the composition of an agent — which tools and behaviors are
available. Prompt profiles vary the system-prompt guidance independently of that
composition: the same agent and tool setup can run under different personas,
styles, and instruction sets by selecting a different profile.

A profile is chosen when a session starts. When a profile is selected, its
sections become part of that session's system prompt. When no profile is
selected, the system prompt is not modified at all.

## Concepts: profile, section, reference, scope, ordering

A **section** is a reusable prompt fragment with a title and a body. A
**profile** is an ordered set of **references** to sections. A reference carries
its own placement and scope, so one section may appear in several profiles with
different placement or scope in each.

**Scope** determines which session and agent contexts can receive a referenced
section — the main session, subagents, or both. A reference that is unknown,
ineligible for the current context, disabled, or empty does not invalidate the
profile; it is simply omitted from the assembled prompt.

**Ordering** is owned by the profile and is deterministic: sections appear in
profile order, equal placements resolve in a stable way, and profile sections
take a stable position relative to the built-in prompt material supplied by the
platform.

## Concept: sealing

The profile choice is resolved while a session's prompt is being assembled, and
the resulting prompt text is fixed for that session. An explicit decision to use
no profile is meaningful and is fixed in the same way.

Variable interpolation in section text is resolved at sealing time, so resumed
sessions reproduce the sealed content rather than re-deriving it from the
current configuration.

## Concept: storage

Editable profile and section definitions, together with the stored profile
choices, are distinct from the sealed per-session content. Editing a definition
or a choice affects sessions sealed in the future; it never rewrites the prompt
of an already-sealed session. Persisted session content exists so that resumed
sessions keep the prompt they started with.

Where an optional storage capability is unavailable, the affected feature
degrades without making prompt assembly itself fail.

## Concept: remote surface

The host owns all profile operations. The web client reaches those operations
through the platform's Remote surface: the bundle publishes its operations
there, and the client mounts and calls them through that channel.

The bundle does not implement a parallel transport of its own, nor its own
authentication or trust boundary — transport and trust belong to the platform.
The contract boundary is the set of profile operations exposed by the host and
consumed by the client; operational detail lives in the module contracts.

## Concept: error model

Invalid input and unavailable, missing, or conflicting data are surfaced as
errors wherever an operation cannot proceed. Optional capabilities, and section
references that turn out to be ineligible or missing, degrade gracefully by
omission wherever it is safe to do so.

A failure must not silently masquerade as a successful change, and it must not
alter the prompt content of an already-sealed session.

## Cross-module invariants

These hold regardless of which module performs the work:

- Profiles never alter agent preset composition or tool availability; they only
  contribute prompt text.
- A selected profile contributes only sections that are eligible, available,
  and emitting real text, in profile order.
- The editor preview is explanatory, not authoritative: the actual session
  assembly determines the final text, so preview output may differ from it.
- Once sealed, session prompt content does not follow later configuration
  edits.

## Deployment requirements

The bundle targets the DSH release stated in the README; that compatibility
statement is the authoritative one and is not broadened here.

On the host, the bundle expects the platform services behind its feature areas:
settings and configuration editing, workspace resolution, durable storage, the
Remote and typing surface, and agent preset inventory. Missing optional
capabilities degrade the affected feature where supported instead of blocking
the bundle. On the web client, it expects the platform settings, conversation,
and primitive UI surfaces.

Installation uses the committed distributable artifacts, so installing does not
require a build. Replacing an installed copy requires a restart of the host,
while a first install can come up through hot module replacement.

## Module contracts

The module-level contracts in `src/` own implementation detail; consult them
for the responsibilities and constraints of individual modules.
