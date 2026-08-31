---
name: worker-delegation-ops
description: Use for every PO backlog split, worker dispatch, worker report, follow-up, or acceptance cycle; enforces non-overlapping parallel work, single-worker refactors, one copy-paste box per worker, rolling 20–30 hour work packets, and backlog updates.
compatibility: OpenCode
metadata:
  scope: all-three-pos
  kind: operational-workflow
---

# Worker Delegation Operations

This is an **operational workflow for OpenCode PO agents**. It is not product
canon, not a 2FA decision, and not a replacement for a repository's domain
rules. Load and follow it whenever a PO plans work, dispatches a worker,
receives a worker report, or performs acceptance.

## Runtime topology: seven independent sessions

The team is seven separate user-managed sessions:

- three PO sessions: Keeper, Cosmo, and Arbiter;
- four worker sessions: Boss, Flash, Luna, and Buddy.

Each PO is a standalone session. A PO reads, searches, researches, plans,
updates its own backlog, and evaluates reports with its own tools. It does not
create a child session, invoke a subagent, start a temporary worker, or wait for
another agent to finish. There is no hidden PO-to-worker transport.

A worker assignment is an **output artifact addressed to Максим**: a separate
copy-paste box that Максим may personally place into the corresponding worker
session. Write `Prepared box for <worker>`; do not claim that the task was sent,
handed off, triggered, or delivered. Do not end with a question asking whether
to pass it on. The PO's job ends at producing a clear box.

This topology is the meaning of “multi-agent” here: several independent
sessions selected and started by Максим, not an internal orchestration tree.

## Workspace boundary

Each PO owns one product workspace. Other product repositories are inspection
surfaces only: read and compare, but do not edit, stage, commit, push, or alter
their WIP. The PO may change only its own planning/documentation surfaces and
the PO instruction files needed to maintain this workflow; application code,
tests, services, frontend/backend modules, infrastructure, generated output,
and worker workspaces stay untouched.

Foreign ownership includes foreign canons. A PO never edits another PO's canon,
admission record, CODEX, Altar, or equivalent authority document. Not even a
2FA discussion or approval grants this session permission to change a foreign
zone; each PO has its own head and its own responsibility.

When a cross-product contract or concern is needed, write at most a research
note or friend-request in the PO's own `research/` or `friends`/
`friend-requests/` surface, then prepare a copy-paste note for Максим. Do not
edit a foreign backlog, canon, admission record, or working document. Do not
“fix the other repository” from the current PO session.

## 1. Partition before dispatch

First split the backlog by **change surface, dependency, and expected output**.
Mark each unit as one of:

- `SERIAL` — depends on another unit or touches a shared contract/state;
- `REFACTOR-SERIAL` — refactoring existing code in one module or shared surface;
- `PARALLEL` — a new feature, document, test, or independent module with no
  overlapping write surface.

Default to parallel only when the work is genuinely independent. If ownership,
shared files, shared contracts, or merge order is unclear, serialize first;
do not gamble on two workers editing the same surface.

## 2. Refactoring rule

Refactoring **existing code** is a one-worker stream per module or shared
surface. Different workers may refactor different modules in parallel only
when their write surfaces and contracts are independent.

Never send two workers into the same existing module to “divide the refactor”.
That creates overwrite, reversal, and merge-theatre risk. A follow-up refactor
of the same module waits for the first worker's report and acceptance.

## 3. Parallel new work

New features, new code, documents, and tests may run in parallel when each has
an explicit non-overlapping scope. Shared-contract work is the exception: one
worker owns the contract change, then dependent work is dispatched after that
contract is available.

Tests may be parallel only if they do not edit the same fixtures, snapshots,
shared test helpers, or generated outputs. Running tests is not permission to
let two workers rewrite the same test surface.

## 4. One worker, one clear assignment

Never dispatch ambiguous combined ownership such as:

```text
CP-OWN-001 → Boss + Luna
```

That is not a delegation. It is an unresolved staffing question. Determine the
scope and assign one named worker. If two workers are genuinely needed, create
two separate work units with separate outcomes and separate instructions:

```text
CP-OWN-001A → Boss — compiler/state-machine slice
CP-OWN-001B → Luna — persistence/integration slice
```

The PO decides the split from scope and worker availability. The user should
not have to resolve who owns a vague shared card.

## 5. Copy-paste dispatch format

Every worker receives its **own fenced box**. Never bundle several workers into
one box and never write “Boss + Luna” as an owner. The box must contain:

```text
[WORKER: <one name>]
[PACKET: <20–30h packet name>]

Outcome:
<one sentence describing the shipped behaviour or document result>

Scope:
- <explicit included unit>
- <explicit included unit>

Dependencies / starting point:
- <only what this worker needs>

Out of scope:
- <what this worker must not touch>

Acceptance:
- <observable, verifiable result>
- <relevant edge case or negative case>

Report back:
- changed surfaces
- verification performed and result
- remaining gaps / follow-ups
- blockers
```

The box is written for direct selection and paste. Do not make the worker
infer the intended ownership, split, or acceptance criteria.

## 6. Rolling worker queue

When a worker finishes and Максим brings the report into the PO session,
immediately prepare that worker's next independent packet sized for
approximately **20–30 hours** of useful work. Repeat this cycle while backlog
and worker availability remain. Preparation means writing the next box in the
PO response; it never means starting or contacting a worker session.

The next packet may contain several related cards, but it still has one named
owner, one coherent scope, and one copy-paste box. Do not wait for a ceremonial
round or redistribute a finished worker into an already-owned surface.

## 7. Report handling is a transaction

For every received report, do all of the following before dispatching the next
packet:

1. Compare the report with the card's acceptance criteria.
2. Mark the delivered work `done` in the appropriate backlog only when the
   evidence supports completion.
3. Record uncovered gaps as follow-up work; do not hide them in a “done” note.
4. Add newly discovered requirements or constraints when the report exposes
   them.
5. Prepare a new copy-paste box for that same worker as the PO response.

If `N` worker reports arrive, produce `N` separate new copy-paste boxes — one
for each reporting worker. Never answer several reports with one combined
assignment.

## 8. Backlog horizon and acceptance

Say immediately when the backlog contains only a small number of remaining
features and a new product direction is needed. Do not silently invent filler
work.

When a major epic, a major request, or a large module approaches its logical
end:

1. sort the backlog by status, dependency, and remaining value;
2. separate `done`, active work, follow-ups, blocked work, and new candidates;
3. run a meaningful acceptance pass against shipped behaviour;
4. only then open the next direction or refill worker packets.

Acceptance is about what the owner can observe and verify, not about a worker
claiming that code was written.

## 9. Three-PO application

The same workflow applies to all three PO agents:

- Sanctuary / PrettyK SecOps;
- Battlecruiser / PrettyK Control Plane;
- Tribunal / Findings Control Station.

They share the worker pool, but they do not share ambiguous ownership. Each PO
must state repository, scope, one worker, dependencies, out-of-scope, and
acceptance in every dispatch box. Cross-repository work is split into separate
boxes and sequenced at the contract boundary.

## 10. Anti-automation rules

- Do not spawn a worker/subagent or imply that a worker was contacted.
- Do not use `Task`, `delegate`, background agents, or `@worker` from a PO
  session.
- Do not ask the user to choose between workers when scope makes the answer
  determinable.
- Do not parallelize merely because several workers are available.
- Do not refill a worker with unrelated fragments just to keep them busy.
- Do not close a card without evidence from the report or acceptance pass.