# Third-Party Notices

This project bundles or makes use of the following third-party software and
services. Their respective licences and terms of service apply to their own
code and assets.

---

## tmi.js

- **Source:** https://github.com/tmijs/tmi.js
- **Licence:** MIT License
- **Copyright:** (c) 2015 Schmoopiie
- **Used as:** `tmi.min.js` (bundled) — Twitch Messaging Interface IRC client used by the overlay to connect to Twitch chat

---

## Twitch API

- **Source:** https://dev.twitch.tv
- **Terms:** [Twitch Developer Agreement](https://www.twitch.tv/p/en/legal/developer-agreement/)
- **Used as:**
  - Helix REST API — badges, cheermotes, channel emotes, user IDs, shared chat channel avatars, token validation (`id.twitch.tv/oauth2/validate`)
  - PubSub WebSocket — channel point redemptions, raids, polls, predictions, hype train events
  - GQL API (`gql.twitch.tv/gql`) — VOD chat replay data via the `VideoCommentsByOffsetOrCursor` persisted query. Requires a valid OAuth token for pagination.
- **Note:** This project does not redistribute any Twitch code or assets. It accesses Twitch APIs under their Developer Agreement.

---

## 7TV

- **Source:** https://7tv.app — https://github.com/SevenTV
- **Terms:** [7TV Terms of Service](https://7tv.app/legal/tos)
- **Used as:**
  - REST API (`7tv.io/v3`) — global and channel emotes, user cosmetics (badges, paints), VOD export per-user cosmetics
  - EventSub WebSocket (`wss://events.7tv.io/v3`) — live mid-stream emote and cosmetic updates
  - CDN (`cdn.7tv.app`) — emote and badge images. Supports CORS, so images can be drawn to OffscreenCanvas in the VOD export pipeline.
- **Note:** This project does not redistribute any 7TV code or assets.

---

## BetterTTV (BTTV)

- **Source:** https://betterttv.com — https://github.com/night/betterttv
- **Terms:** [BetterTTV Terms of Service](https://betterttv.com/terms)
- **Used as:** REST API (`api.betterttv.net`) — global and channel emotes for the live overlay
- **Note:** BTTV emotes are not available in the VOD chat export because `cdn.betterttv.net` does not send CORS headers, preventing images from being drawn to an OffscreenCanvas from a browser origin. This is a CDN limitation outside our control. This project does not redistribute any BTTV code or assets.

---

## FrankerFaceZ (FFZ)

- **Source:** https://www.frankerfacez.com — https://github.com/FrankerFaceZ
- **Terms:** [FrankerFaceZ Terms of Service](https://www.frankerfacez.com/p/tos)
- **Used as:** REST API (`api.frankerfacez.com`) — global emotes, channel emotes, and FFZ community badges. Used in both the live overlay and VOD chat export.
- **Note:** This project does not redistribute any FFZ code or assets.

---

## Chatterino

- **Source:** https://chatterino.com — https://github.com/Chatterino/chatterino2
- **Licence:** [MIT License](https://github.com/Chatterino/chatterino2/blob/master/LICENSE)
- **Used as:** Public badge API (`api.chatterino.com/badges`) — community Chatterino badges displayed next to usernames in the live overlay
- **Note:** This project does not redistribute any Chatterino code or assets.

---

## Mediabunny

- **Source:** https://github.com/Vanilagy/mediabunny
- **Licence:** [Mozilla Public License 2.0](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE)
- **Used as:** Browser-side media toolkit for the VOD chat export feature. Handles WebM container muxing and VP9 video encoding with alpha channel (transparency) support via the `CanvasSource` API. The built `mediabunny.cjs` distribution file is hosted locally in the repository root (downloaded from the [GitHub releases page](https://github.com/Vanilagy/mediabunny/releases)).
- **Note:** MPL-2.0 is a weak copyleft licence. YACOFO uses Mediabunny as an unmodified library loaded at runtime and does not modify or redistribute its source code, so no copyleft obligations are triggered beyond this attribution notice.