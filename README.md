# Lottery Guarantee Calculator

Generate the minimum set of lottery tickets that **mathematically guarantees** a specified match level, no matter which numbers are drawn.

**Live demo:** [loterando.com](https://loterando.com/)

## Features

- **Configurable lottery format** — set any "pick K from N" main draw, with optional bonus draw
- **Guaranteed coverage** — uses a greedy covering design algorithm to find the smallest ticket set that covers every possible t-subset
- **Estimate before generating** — preview ticket count and cost range without running the full computation
- **Ticket statistics** — probability breakdown per match level, expected wins, coverage ratio, and guaranteed-level highlighting
- **Sanity check** — exhaustively verify the guarantee by testing every possible combination against your tickets, with a certified pass/fail badge
- **Simulation** — enter the actual drawn numbers and prize tiers to see results, expected values, probabilities, and ROI
- **Multi-language** — English, Portuguese, Spanish, French, German, and Chinese
- **Runs entirely in the browser** — no backend required; heavy computation runs in a Web Worker to keep the UI responsive
- **Mobile friendly** — responsive layout that works on phones and tablets

## How It Works

The core algorithm solves the **covering design problem**: given a lottery that picks `k` numbers from a pool of `n`, find the fewest tickets such that every possible `t`-element subset of `{1..n}` appears in at least one ticket. This guarantees that no matter which `k` numbers are drawn, at least one ticket matches `t` or more.

1. Track all C(n, t) subsets using the **combinatorial number system** for O(1) rank/unrank
2. **Greedy set cover** — each iteration picks a random uncovered t-subset, generates candidate tickets containing it, and selects the one covering the most new subsets
3. Repeat until all subsets are covered

This is an NP-hard problem; the greedy approach gives a ln(n)-approximation in practice.

## Tech Stack

- Vanilla HTML/CSS/JS — no build step, no dependencies
- Web Worker for off-thread computation
- GitHub Pages for hosting via GitHub Actions

## Running Locally

Open `index.html` directly in a browser, or serve it locally:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## License

MIT
