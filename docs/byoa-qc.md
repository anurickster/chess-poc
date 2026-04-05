# `/byoa` QC For BYOA Chess Demo

Date checked: 2026-03-29 UTC

## Current page state

The live `https://saroir.com/byoa` page is a concept and positioning page for three agents:

- contributor-scoped personal agent,
- project-scoped memory agent,
- platform-scoped home agent.

The page is not a playable demo and does not currently expose the chess proof of concept.

## Demo contract alignment

The standalone chess POC demonstrates these claims well:

- session-tethered agent behavior,
- explicit auditability,
- model-agnostic configuration at the app level,
- retrieval-backed answers over allowed materials.

The standalone chess POC does not demonstrate these platform-wide claims:

- cross-domain knowledge graph behavior,
- project cohort briefings,
- contributor identity and domain separation inside Saroir,
- moderator workflows,
- public/private platform data boundaries across real Saroir projects.

## QC findings

1. The page should clearly label the chess app as a standalone BYOA demo so readers do not confuse it with the full platform implementation.
2. The page needs a visible CTA linking to the chess demo, ideally near the “What your agent can do” section and in the footer.
3. Claims about Home Agent and ProjectBot should be qualified as platform architecture, not features shown by the chess demo.
4. If the demo is shown publicly, the page should mention the exact active model and that move generation is deterministic rather than LLM-driven.
5. If “every action is logged” is kept as copy, the demo should expose an audit panel or run id to make the claim inspectable.

## Recommended copy adjustment

Suggested CTA:

> Try the BYOA chess demo: a standalone proof of concept showing session-scoped agent answers, retrieval-backed explanations, and full audit logging.
