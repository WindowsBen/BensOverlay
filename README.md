# Twitch Chat Overlay

A self-hosted, fully configurable Twitch chat overlay designed for OBS and other broadcast software. Runs entirely in a browser source — no applications to install, no subscriptions, no tracking.

---

## Features

**Chat**
- Full Twitch chat with badges, emotes, and username paints
- Third-party emotes from 7TV, BetterTTV (BTTV), and FrankerFaceZ (FFZ)
- Third-party badges from FFZ and Chatterino
- 7TV username paints and cosmetic badges with live mid-stream updates
- Cheermote rendering (animated bit emotes with tier images)
- Zero-width / overlay emote stacking (7TV)
- Reply context (quoted parent message above reply messages)
- Highlighted message styling with configurable accent colour
- `/me` action message styling (coloured, italic, or plain)
- Announcement messages (`/announce`)
- Message filtering by username or message prefix
- Shared chat support - guest channel messages show the channel's profile picture as a badge

**Events**
- Subscriptions and resubscriptions (with Twitch emote rendering in resub messages)
- Gift subscriptions
- Bit cheers
- Channel point redemptions (text-input redeems via both IRC and PubSub, deduplicated)
- Watch streak milestones
- Incoming and outgoing raids
- Ban and timeout animations (hammer and clock)

**Widgets** *(require broadcaster token)*
- Live poll widget with animated vote bars
- Prediction widget with outcome percentages
- Hype train progress bar

**Appearance**
- Custom font support (any CSS font URL, e.g. Google Fonts or cdnfonts.com)
- Configurable font sizes, line height, message spacing, and message lifetime
- Per-event accent and background colours with opacity control
- Text shadow on usernames and message bodies
- Slide-in animation with configurable distance and duration
- Fade-out animation with configurable duration
- Badge control: disable all, role-only (Broadcaster/Mod/VIP), or all third-party cosmetics

**Configurator**
- Visual config page with live preview window that updates as you change settings
- Light/dark preview background toggle to test against any stream layout
- All event types shown or hidden in the preview based on your toggle settings
- Animated preview for mod actions, polls, and predictions
- Tooltip descriptions on every setting
- Export and import config as a portable string
- One-click URL generation for OBS

---

## Setup

### 1. Open the Configurator

Visit **[windowsben.github.io/\<repo-name\>](https://windowsben.github.io)** — you'll land on the configuration page directly. No account, no install, nothing to download.

> A custom domain is coming soon.

### 2. Log in with Twitch

Click **Login with Twitch**. This opens Twitch's OAuth flow and grants the overlay read-only access to your channel data. The token is stored only in your browser's URL — it is never sent to any server other than Twitch's own API.

**Scopes requested:**

| Scope | Purpose |
|---|---|
| `user:read:chat` | Connect to IRC and read chat messages |
| `channel:read:redemptions` | Receive channel point redemptions via PubSub |
| `channel:read:polls` | Receive live poll data via PubSub |
| `channel:read:predictions` | Receive live prediction data via PubSub |
| `channel:read:hype_train` | Receive hype train events via PubSub |

> All scopes are **read-only**. This overlay cannot post messages, moderate users, or make any changes to your channel.

### 3. Configure

Work through the tabs:

- **General** — channel name, message appearance, timing, filtering, font
- **Events** — enable/disable each event type and customise colours and labels
- **Polls / Predictions / Hype Train** — enable widgets and customise colours
- **Appearance** — badge settings and third-party cosmetics

The **Live Preview** panel on the right updates in real time as you change any setting.

### 4. Generate and Copy the URL

Switch to the **Generate** tab and click **Generate Link**. Copy the resulting URL.

> Whenever you change a setting, the Generate tab will flash to remind you to regenerate your link.

### 5. Add to OBS

1. In OBS, add a new **Browser Source**
2. Paste the generated URL into the URL field
3. Set width and height to match your canvas (e.g. 1920 × 1080)
4. Check **Refresh browser when scene becomes active** (optional but recommended)

---

## Self-Hosting

The overlay is entirely static files with no build step, so you can host it anywhere.

1. Fork or clone this repository
2. Enable GitHub Pages on the `main` branch (root) in your repo settings
3. Update the Twitch OAuth redirect URI in `config/auth.js` to point to your own URL
4. Everything else works as-is

---

## File Structure

```
/
├── index.html          # Configurator page
├── overlay.html        # The actual overlay loaded by OBS
├── style.css           # Overlay styles
├── tmi.min.js          # tmi.js IRC client (bundled, MIT licence)
│
├── config/
│   ├── auth.js         # Twitch OAuth login flow
│   ├── config.css      # Configurator styles
│   ├── generate.js     # URL generation and config export/import
│   ├── preview.js      # Live preview panel renderer
│   ├── tooltips.js     # Setting description tooltips
│   └── ui.js           # Tab switching, sliders, and UI helpers
│
└── src/
    ├── config.js        # Parses URL parameters into CONFIG object
    ├── main.js          # Entry point — connects IRC, wires all handlers
    ├── pubsub.js        # Twitch PubSub WebSocket (redemptions, raids, polls, etc.)
    ├── seventv-ws.js    # 7TV EventSub WebSocket (live emote/cosmetic updates)
    ├── utils.js         # Shared helpers (escapeHTML, parseColour, etc.)
    │
    ├── emotes/
    │   ├── emoteMap.js   # Shared emote lookup map
    │   ├── bttv.js       # BetterTTV emote fetching
    │   ├── ffz.js        # FrankerFaceZ emote fetching
    │   ├── seventv.js    # 7TV emote fetching and zero-width support
    │   └── cheermotes.js # Twitch cheermote rendering
    │
    ├── badges/
    │   ├── badgeMap.js   # Shared badge lookup map
    │   ├── twitch.js     # Twitch native badge fetching
    │   ├── ffz.js        # FFZ badge fetching
    │   ├── chatterino.js # Chatterino badge fetching
    │   └── seventv.js    # 7TV cosmetic badge and paint fetching (LRU cached)
    │
    ├── chat/
    │   ├── parser.js     # Message parsing (emotes, mentions, links)
    │   ├── renderer.js   # Chat message DOM rendering
    │   ├── events.js     # Sub/gift/bits/streak/raid event messages
    │   ├── redemptions.js# Channel point redemption rendering and deduplication
    │   └── moderation.js # Ban, timeout, and message deletion handling
    │
    └── ui/
        ├── paints.js         # 7TV username paint application
        ├── toasts.js         # 7TV emote change notifications
        ├── mod-animations.js # Ban hammer and timeout clock animations
        ├── poll.js           # Poll widget
        ├── prediction.js     # Prediction widget
        └── hype-train.js     # Hype train progress bar
```

---

## Privacy

- Your Twitch OAuth token lives **only in the OBS browser source URL** and your local browser session. It is never transmitted to any server other than `api.twitch.tv`.
- No analytics, telemetry, or tracking of any kind.
- No backend — the overlay is 100% static files.
- Third-party emote and badge data is fetched directly from 7TV, BTTV, FFZ, and Chatterino's own public APIs at load time.

---

## Third-Party Services

This overlay fetches data from the following public APIs at runtime. No data is sent to them — they are read-only calls.

| Service | What it provides | API used |
|---|---|---|
| [Twitch](https://dev.twitch.tv) | Chat, badges, cheermotes, channel points, events | Helix REST API + PubSub WebSocket |
| [7TV](https://7tv.app) | Emotes, user paints, cosmetic badges | REST API + EventSub WebSocket |
| [BetterTTV](https://betterttv.com) | Emotes | REST API |
| [FrankerFaceZ](https://www.frankerfacez.com) | Emotes, badges | REST API |
| [Chatterino](https://chatterino.com) | Community badges | REST API |

Use of each service is subject to their respective Terms of Service. See `LICENSE` for details.

---

## Licence

This project is released under the **MIT Licence** — free to use, modify, and distribute for any purpose, including commercial use, as long as the original licence notice is retained.

See [LICENSE](./LICENSE) for the full licence text and [THIRD PARTY NOTICES](./THIRD-PARTY-NOTICES.md) for attribution notices covering all bundled and consumed third-party components.