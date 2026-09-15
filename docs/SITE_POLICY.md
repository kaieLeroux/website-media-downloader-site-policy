# Site Policy

This fork is deny-by-default. `config/site-policies.local.json` is the private source of truth and is ignored by Git. Copy the neutral `config/site-policies.example.json`, edit it locally, then rebuild. The build embeds it as `site-policies.json` and converts enabled domains to static content-script matches.

Built XPI files are also ignored because they contain that embedded private policy. `artifacts/SHA256SUMS` may be committed, but the matching local XPI must not be pushed to a public repository.

A request is accepted by the **top-level tab policy**, not the media CDN hostname. Background and extension requests (`tabId < 0`) fail closed. Exact hostname-boundary matching prevents suffix attacks. Candidate rules reject DRM-marked items and HLS/DASH segments; quality scoring prefers resolution, bitrate, then length. Signed URL parameters are removed only for deduplication.

Static content scripts were chosen over dynamic registration because startup behavior is simpler and more predictable across Firefox desktop and Android. `<all_urls>` remains a host permission because media CDNs change; this grants observation capability, but the first detector operation is the tab gate.

## Local schema

Each policy has `id`, `domains`, optional `pathPrefix`/`priority`, `enabled`, `autoDownload`, `media`, `silent`, `quietWindowMs`, `maxWaitMs`, and `drm`. Image modes are semantic adapter hints. `drm` must be `SKIP`; this project does not bypass DRM.
