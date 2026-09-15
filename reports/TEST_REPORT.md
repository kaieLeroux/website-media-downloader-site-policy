# Test report

Cloud unit fixtures are self-contained and cover root/subdomain/override matching, malicious suffix denial, denied policies with no queued/download side effects, DRM, segments, UI images, signed URL deduplication, candidate grouping and highest-resolution selection. Firefox build and source syntax checks are recorded during release generation.

**TEST_REQUIRES_ANDROID_DEVICE:** install acceptance on Firefox Android 154+, Android 16 download UX, background survival, real-site authenticated media, memory/load measurements, CDN/header behavior, and completion of reconstructed HLS/DASH downloads.

Mozilla `web-ext lint` could not be installed in this Cloud run because the npm registry returned HTTP 403. This is an environment limitation, not a passing lint result; repeat the documented command when registry access is available.
