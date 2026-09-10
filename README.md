# TrueFace Web SDK — Sample 2

The hosted SDK with a **fully custom UI theme**.

Where [`web-sdk-sample`](../web-sdk-sample) serves the SDK out of a sibling
checkout and loads the stock stylesheet, this sample:

1. Loads the **published** build from jsDelivr — the same artifact a merchant
   gets, minified exactly as the release workflow produced it.
2. Never loads `trueface-web-sdk.css`. [`public/theme.css`](public/theme.css)
   restyles the SDK's DOM from scratch.

## Running it

```bash
cp .env.example .env      # add TRUEFACE_SECRET_KEY
npm start                 # http://localhost:4002
```

No dependencies; Node 18+. Without a secret key the page still works — use
**Use an existing session** and paste a verification id, client secret and
publishable key created elsewhere.

| Variable | Purpose |
| --- | --- |
| `TRUEFACE_SECRET_KEY` | Server-to-server session creation. Never reaches the browser. |
| `TRUEFACE_API_URL` | REST API base. Point at a local stack to test backend changes. |
| `TRUEFACE_GRPC_URL` | Realtime liveness service base. |
| `TRUEFACE_SDK_VERSION` | Which published tag to load from jsDelivr. |
| `PORT` | Defaults to 4002. |

The SDK version is pinned in one place only — the server reads
`TRUEFACE_SDK_VERSION` and `public/boot.js` fetches it from `/api/config`
before injecting the `<script>`, so the page and backend cannot drift.

## How the theming works

The SDK builds its own DOM and tags it with stable class names. Supply your
own rules for those names and you control the appearance. Because the stock
stylesheet is absent, `theme.css` has to provide **layout as well as colour** —
including `object-fit: cover` and the `transform: scaleX(-1)` mirror on the
video, which the stock sheet would otherwise handle. Get that wrong and the
preview reads backwards.

```
.trueface-container            the element you pass to start()
  .trueface-overlay
    .trueface-viewport
      video.trueface-video
      .trueface-oval-guide     + .valid / .action / .error
        .trueface-scanner-line
    .trueface-guidance-panel
      .trueface-step-badge
      p.trueface-prompt
      .trueface-progress-wrapper
        .trueface-progress-bar
  .trueface-instructions-card  before the session starts
  .trueface-processing-card    during upload
  .trueface-outcome-card       final result
  .trueface-error-banner       transient
```

What this theme changes, beyond colour:

- **Guidance panel moved to the bottom** and made an opaque, left-aligned card;
  the stock theme floats a centred glass panel at the top.
- **Face target is a bracketed rounded rectangle**, not a dashed ellipse
  (`border-radius: 14px` with `::before`/`::after` corner brackets).
- **Scanning line removed** (`display: none`) — SDK chrome can be dropped, not
  just recoloured.
- **Tips list rendered as ruled rows** rather than separate raised cards.
- Serif prompts, square-ish geometry, warm light palette throughout.

### The two constraints

The SDK sets exactly two inline styles, and inline styles beat stylesheets:

- `display: flex` on `.trueface-overlay` — harmless here, since everything is
  positioned absolutely.
- `width` on `.trueface-progress-bar` — that one is data, not styling.

### What CSS cannot change

Copy, element structure, and flow order are all fixed: prompt strings,
challenge sequencing and the instruction card's contents are built in JS. A
theme can restyle, reposition and hide what the SDK renders, but it cannot
rewrite it. Changing those needs a callback/headless mode in the SDK itself.

## Verified

Checked against the live CDN build in headless Chrome:

- hosted `v0.2.0` loads; the wasm core instantiates and reports 17 exports
- minification is non-destructive — geometry, the blink latch, AES-GCM payload
  encryption and gRPC-Web framing all behave after terser
- the theme wins: panel anchored bottom, paper background, rounded-rect target,
  scanner hidden
