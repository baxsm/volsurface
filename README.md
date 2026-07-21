# volsurface

An options pricing and volatility surface workbench. Price American and European options, solve implied volatility from live chains, build multi-leg strategy payoffs, and explore an arbitrage-free implied-volatility surface in 3D.

## Setup

Requires [Bun](https://bun.sh), Node 20+, Docker, and a Postgres connection string.

```
bun install
```

Copy `.env.example` to `.env` in each service and fill in the values, then start the stack.

More setup detail lands with the first build phase.
