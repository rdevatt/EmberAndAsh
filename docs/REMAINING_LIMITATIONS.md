# Remaining limitations

What is not done, not fully done, or done with a known weakness, after the completion pass of 2026-11-09. Each item says what the limit is, why it exists, and what would remove it. Nothing here is hidden elsewhere: the test report and completion status point to this list.

## Needs the owner

| Item | State | What is needed |
| --- | --- | --- |
| Publishing the database-history purge | Prepared and dry-run verified (15 → 0 database blobs, file trees otherwise identical). **Not run against the remote.** | Your explicit go-ahead to run `scripts/security/purge-db-history.sh --push`. It rewrites history and force-pushes, which invalidates existing clones. |
| Pushing this branch | Every milestone is committed locally on `claude/ember-and-ash-completion`. **Nothing has been pushed.** | Your go-ahead to push (and, if you want, to open a pull request). |
| The one historical account | Its bcrypt hash (cost 10) was in the old database blobs. | If it belonged to a real person, ask them to change that password wherever it was reused. |
| Production settings | Code is ready. | Set `TRUST_PROXY=1` on Railway; set `EMBER_BACKUP_HOURS` and copy backups off the machine; set `ALLOWED_ORIGINS` only if the API is served from another origin. |
| CI | `.github/workflows/ci.yml` is written and was simulated in a clean clone (229 / 229, three runs). | It runs only once the branch is pushed. It has never run on GitHub itself. |

## Game systems

- **Campaign length still depends on the path.** Measured across 24 campaigns (12 classes × 2 seeds × all four endings), every run finished with no server errors, but the spread is wide.
  - Most runs took 1,798–3,721 actions. A tail of four ran 5,335–8,979: casters on the Ascend or Remnant paths whose bot had no companion.
  - The bot only tried to recruit Maren Holt, who will not join anyone the Wardens distrust. It now hires sellswords on other paths, as a player would.
  - With sellswords, the worst three runs improved: druid seed 7 Ascend 8,626 → 5,980 actions (41 → 15 deaths), warlock seed 11 Remnant 7,527 → 4,323, cleric seed 11 Remnant 6,105 → 5,779.
  - That is still roughly twice the Wardens path (druid seed 7 Wardens: 2,602). Most of the extra time is chapters 7–8, where a character the Wardens hate (−100) is refused service in Warden-held towns.
  - This is a real balance gap for villain and Remnant paths. It would close with havens for the Choir and Remnant in the late regions (shops and inns that serve their allies), or Choir- and Remnant-aligned companions offered earlier.
- **Bard and druid pacing was tuned on the Wardens path.** There, bards went from 3,609 / 2,810 actions to 2,610 / 2,641, and druids from 3,756 / 3,068 to 2,602 / 3,111. Rogues and rangers remain the strongest classes.
- **Deep rift diving at levels 130–140 can stall a bot.** Each death past level 100 costs a quarter of the progress toward the next level. A post-game fighter spent its last ~1,700 of 3,000 actions near level 136–137, dying in rift depths it could not hold. A person would stop diving; the bot does not.
- **Adventures are templates filled from world state.** The eleven kinds (investigation, rescue, trade, exploration, construction, research, military, negotiation, intrigue, personal, history) are real and enforced, but each kind has one shape of steps. Variety comes from the world: who died, which town struggles, which war is on, which throne is disputed.
- **Companion stories are one arc each.** All eight companions have a multi-stage story with real consequences. There is no second arc after it ends.
- **NPC depth is computed, not simulated.** Goals, concerns, views, rivalries and successions are derived from world state each time they are asked for, and every succession is recorded. NPCs do not pursue their goals on their own between visits.
- **Politics and the world's life are yearly.** Wars, successions, movements, disasters, institutions and rivalries advance once per in-game year (deterministically per world). Nothing happens between those turns except crises, which run monthly.
- **The economy is a price index, not a market.** Prices respond to ruin, occupation levies, rulers' decrees, disasters, war and standing. There is no supply and demand for individual goods.
- **No external image provider.** The brief allowed an optional one if the offline art stayed the fallback. None was added: all art is the built-in SVG renderer, which draws simple vector scenes.

## AI narration

- **Provider rules still apply.** The narrator follows the player's content settings; a provider may still decline a scene. When it does, the game says so and its own narrator tells the turn (tested with a fake client).
- **The action guard is a filter, not understanding.** It removes sentences that add player actions the input and the engine did not license (11 kinds of act). It cannot catch every paraphrase, and it can occasionally trim a harmless sentence. Live runs removed 1–7 invented sentences per 6–11 turns, with no regenerations or fallbacks needed.
- **Live testing was kept within budget.** Across the pass: an 11-turn agency run, a 12-turn two-generation canon run, and a 36-action acceptance run, all with the real model (`qwen/qwen3.8-27b`). The 10,000-turn memory test uses a mocked model.

## Mature content

- **The adult declaration is self-attested.** It is not verified age assurance, and the UI says so.
- **The age rule stays.** Nothing sexual involves anyone under 18, in narration, art or shadow, whatever the settings. Coerced acts are narrated as crimes and drawn only as a threat and its aftermath. These two lines are deliberate and not configurable.

## Testing

- **Live AI tests are scripts, not part of `npm test`**, so the suite never needs a key or spends money. Run `node scripts/live-narration-check.js` and `node scripts/acceptance-tester.js --live` by hand.
- **Campaign matrices are evidence runs, not CI.** One full campaign takes 1–3 minutes, and the 24-run matrix about 15 minutes. They are run with `scripts/playthrough.js` and recorded in the test report.
- **Statistical tests use random worlds.** Several tests (dynasties, movements, institutions, adventures) build worlds with random IDs. They were repeated 6–12 times after fixing every flake found. A rare unlucky world remains possible.
