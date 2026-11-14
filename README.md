# Generosity

**Kindness, compounding across Solana.**

[![Live site](https://img.shields.io/badge/live-Generosity.live-02bc24)](https://Generosity.live)
![Chain](https://img.shields.io/badge/chain-Solana-black)

## Overview

Generosity is a community token on Solana built around one belief: giving outperforms taking. This repository holds the static site served at [Generosity.live](https://Generosity.live).

- **Chain:** Solana mainnet
- **Contract address:** `TBA` (the site shows it, with click-to-copy, as soon as it is announced)

## Features

- Always-visible contract address slot, inert until the address is published
- Live Solana market board and ticker (DexScreener), refreshed every minute and paused while the tab is hidden
- Pinned Generosity row that switches to live DexScreener and pump.fun data once the contract address exists
- Skeleton loaders, count-up values, spring-driven reveals and parallax, with a full reduced-motion fallback
- Single register file for every external fact, so unannounced links stay inert

## Links

- Site: https://Generosity.live
- X: https://x.com/Generosity
- X (token): https://x.com/GenerosityToken
- GitHub: not yet available

## Development

```bash
npm run build   # builds into dist/ and runs the gate checks
npm run serve   # serves dist/ on http://localhost:4173
```

Facts live in `src/registry.json`; colours live in `src/tokens.css`. Deploy the contents of `dist/`.

## License

MIT, see [LICENSE](LICENSE).
