# The Reading Library

Reading passages are **app-level**, not project-level: a moderator writes one and
every project can draw on it.

| | Where | Writable | What it is |
| --- | --- | --- | --- |
| Shipped packs | `services/api/app/resources/reading-packs/` | No | Application source, versioned in git |
| Authored packs | `<data root>/reading-packs/` | Yes | What the authoring dialog writes; machine-local, gitignored |

Authored content stays out of `app/resources/` on purpose. Writing a moderator's
work into the source tree would lose it on the next update and would put it in
every `git status`.

## Authoring a passage

Recorder → **HQ** → **Add Training Script**, under the session button. Paste the
prose; the dialog splits it into cards and shows what each one will cost in
seconds before anything is saved.

## Audience tags mean "suits", not "belongs to"

`regions`, `genders` and `ageRanges` are multi-valued, and **an empty list means
no restriction** — a passage nobody may read is useless. They exist so a user
preparing to train a specific voice can find passages written for that case;
they never stop anyone from reading anything.

The vocabulary is served by `GET /api/reading-packs/audience` and comes from the
engine's own voice-design facets, so a passage is tagged in the same terms a
Speaker Profile is described in. Region is language-shaped rather than
universal: accents for English, dialects for Chinese, and the three regions
Project Hub already offers for Vietnamese.

## How pasted text becomes cards

A card is one take, and both engines want 2–15 second samples, so the split
decides the shape of every training sample the passage produces.

- A card never straddles a sentence end. That boundary becomes a sample
  boundary, and half a sentence teaches a prosody contour that stops mid-thought.
- Fragments merge forward, or backward when nothing follows them.
- An over-long sentence splits at clause punctuation, never mid-clause.
- Anything still outside the window is flagged in the preview rather than
  quietly saved.

`test_shipped_cards_stay_inside_the_training_duration_window` holds the shipped
packs to the same rule. It has already caught two closing lines that were under
the two-second floor and would have been dropped by OmniVoice's own filter.

## The password is not access control

The dialog asks for a username and password. That gate is **a mis-click guard in
the browser and nothing more**:

- the passcode is stored in `localStorage` on the authoring machine;
- `POST /api/reading-packs/passages` answers anyone who can reach the API,
  with or without the dialog;
- the API is reachable from the tailnet whenever Tailscale Serve is on.

This is a deliberate first step, not an oversight. When real authentication
arrives it belongs **on the route**, and this form becomes its front end rather
than its substitute. Until then, do not describe it to anyone as a permission
system.
