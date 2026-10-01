# Launch plan: customer input for the harness

Status: ON HOLD until sponsorship from classifier.dev and TypeSafe is agreed.
Written 2026-10-01 from an office-hours session. Owner: Joe. Internal.
Goes with [GTM.md](GTM.md).

## Start condition

Begin this plan only when classifier.dev or TypeSafe has agreed to sponsor the harness: credits, a pro plan, a listing, co-marketing or a paid contract. Until then the harness stays Laurelin's internal tool, Frege keeps its name and product, and the two Frege memory customers keep their service.

## What office hours found

1. No outside user has asked for the harness. Joe is the only user. The positioning line ("the governed agent: trust it to finish unattended, with a full audit trail") is a hypothesis to test, not a line to launch.
2. Frege's only real demand is two paying customers for governed memory. A pivot must keep serving them.
3. The edge over Jcode, Herdr and Agent Relay is proof that the work was done: checks that block a false "done", and receipts. Fleet management is where those companies already lead.
4. The first buyers are solo founders and small dev teams who run agents unattended. Regulated organizations come later.
5. Joe believes the harness has more potential than Frege's memory product. This plan tests that belief with customer input before any rename or launch.

## The assignment (seven days from the start condition)

| Target | Measure |
|---|---|
| Conversations | 10 people who leave agents running unattended |
| Named people | 3, quoted in their own words |
| Money | 1 paid pre-order |

## 1. Find the people

- classifier.dev: ask its founder for introductions to three of its heaviest users.
- Joe's networks: YC applicants, Antler, Z Fellows. One message: "Do you leave Claude Code or Codex running unattended? I would like 15 minutes on the last time it went wrong."
- Public complaints: posts on X and Hacker News about agents that claimed "done" and were not, or overnight runs that went wrong. Trust and visibility issues filed on the Jcode and Herdr repositories.
- Frege's lead customer: ask how they run agents today. This also tells us whether a pivot keeps them.

## 2. Ask about their past, never the idea

Do not pitch. Ask:

1. "Tell me about the last time you left an agent running and came back. What had it done?"
2. "How did you check whether it finished? How long did that take?"
3. "What is the worst thing an agent did that you only found out about later?"
4. "What do you use today to keep track? Did you pay for anything to fix this?"

Write down their exact words. When three people describe the pain in the same words, those words become the positioning line.

## 3. Watch, do not demo

Ask two people to share their screen while they run their agent the normal way. Say nothing. Note where they stop, check twice or start again. Those points are the product.

## 4. Ask for money

At the end of a good conversation, offer a founding plan: early access at $20 a month, or a one-time founding license (Agent Relay charges $149). One payment counts more than any number of waitlist signups.

## 5. Put the smallest version in their hands

Most people will not change their harness for a stranger. The fastest test is an add-on to the agent they already use: a "proof of done" check that runs after Claude Code or Codex finishes, checks claims against sources, blocks a false "done", and keeps a receipt. This is a few days of work, and it shows the edge directly. If people want it, the full harness is the upgrade.

## Decision after the seven days

| Result | Next step |
|---|---|
| 3 quotes agree and 1 person pays | Write the line from their words. Plan the Frege pivot or a new name with the evidence. Start Phase 2 of GTM.md. |
| Pain is real but nobody pays | Ship the "proof of done" add-on free with the classifier.dev write-up, and measure use. |
| No shared pain | Keep the harness internal. Keep Frege on governed memory. |
