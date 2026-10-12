# User test retest: Maria (68, IT basic, phone, poor eyesight, careful)
Date 2026-10-12 · 390px phone at browser zoom 200% (195px CSS width, touch) · test copy at localhost:8099 with sample data
Compares against docs/user-tests/2026-10-12-maria.md. Same goals: answer her agents' questions, see whether anything needs her.

## Result: both reported bugs are FIXED, two new readability problems appeared
| Earlier bug | Now | Evidence |
|---|---|---|
| Header overlap (title / "Message all leads" / "Add project" / "Live") | FIXED. Title, "Live" line and the two buttons stack with no overlap, nothing cut off (buttons at x 16-94 and 102-179 of 195) | img/maria-retest-1-home-200.png |
| Page scrolls sideways at 200% | FIXED. scrollWidth = clientWidth = 195 on home, after tapping "3 Need you" and after approving; no element extends past the right edge | maria-retest-2-needs-tap.png, -5-after-approve.png |
| Colour table wider than its card | FIXED for width: table (x 33-162) sits inside the card (x 16-179) | maria-retest-3-colors-card.png |

## Steps
1. Opens page: header readable, orange "3 Need you" tile first. Understands something needs her.
2. Taps "3 Need you": scrolls to "Needs you" (3 cards), no sideways scroll.
3. Reads "Test cleanup" question (2 numbered questions), taps Approve (button 61x94 px, easy to hit). Card shows "Approved just now. Not picked up yet." The answer was written (answers/a2, decision approve). Still unclear to her what "picked up" means.

## Findings
- bug (new, medium): colour table in the "Booking page colors" card is squeezed so each header and cell wraps one letter per line ("N a m e", "H e x"); the colours can't be read at 200%. Fix by letting the table scroll inside its own box or stack the rows as label/value pairs. (maria-retest-3-colors-card.png)
- bug (new, low): count tiles break words mid-word at this width ("agent s runni ng"). (maria-retest-1-home-200.png)
- confusing: header takes 194 of 422 px of the visible screen (46%) and is sticky, so it eats the screen while she reads cards. Suggest not sticky at narrow widths (idea, needs CEO).
- confusing (unchanged): "Not picked up yet", "P1 project" chip, long auto-proceed timer text.
- Not rechecked this run: contrast (4.42:1 chips) and tap targets under 44px from the first test; assume still open until the lead says they were fixed.
No blocker: she can finish her goal.
