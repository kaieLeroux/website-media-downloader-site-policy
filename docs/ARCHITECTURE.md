# Architecture

1. The build reads the ignored local policy and emits static content-script matches.
2. `site_policy.js` performs URL matching, media admission, segment rejection, quality selection and conservative identity normalization.
3. `network_detector.js` caches policy by top-level tab. Every request-body/header/response listener fails closed before URL, MIME, candidate, storage, notification, or download work. CDN requests inherit the initiating tab's policy.
4. Allowed content scripts retain upstream deep DOM and surgical detection. Both network and DOM candidates enter `auto_archive.js`, settle by identity for a quiet window (bounded by maximum wait), and download only the highest score once.
5. Stream manifests are never downloaded as standalone files: they start the upstream highest-quality reconstruction job. YouTube adaptive tracks start the upstream lossless video/audio mux job. DRM candidates are skipped. Notifications default off. The permission is retained because upstream's explicitly enabled progress UI still references it; silent mode never calls that path.

The popup is explicit user interaction and reports the current effective policy. No telemetry, remote processing, credential collection, DRM circumvention, or profile mutation is added.
