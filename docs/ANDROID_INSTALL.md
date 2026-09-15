# Firefox Android installation

The Cloud artifact in `artifacts/website-media-downloader-site-policy-2.3.2.1-firefox-unsigned.xpi` is unsigned and intentionally Git-ignored because it embeds the private policy. Firefox Android release builds generally require an AMO-signed add-on; do not modify a Firefox profile.

1. Create an AMO API key in a browser (human action).
2. On a trusted machine, set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` only in the shell environment.
3. Run `npx web-ext sign --source-dir build/firefox --channel unlisted --artifacts-dir artifacts/signed`.
4. Open the returned signed XPI on Firefox Android 154+ and approve installation. Never commit the credentials or signed private metadata.

Installing and validating downloads, background behavior, and memory use on Android 16 is **TEST_REQUIRES_ANDROID_DEVICE**.
