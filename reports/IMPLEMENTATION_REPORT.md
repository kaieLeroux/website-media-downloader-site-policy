# Implementation report

Baseline: upstream `wmd-1` v2.3.2 commit `60218d0`. A live fetch was attempted but the Cloud CONNECT tunnel returned HTTP 403, so the preloaded checkout was audited. Required manifest, detector, scraper, YouTube, stream, conversion, download, settings, popup, build, README and GPL files were reviewed.

Implemented a separate extension identity/version, private build-time policies, static DOM injection allowlisting, top-level-tab network gates, silent defaults, candidate settling, quality selection, signed-URL deduplication, segment/DRM rejection, direct-file auto-download, popup status and debug counters. Broad host permission is retained for volatile CDNs.

Adapter completion: upstream YouTube extractor and generic/surgical detection are retained; X/TikTok/Pixiv/nijie/Niconico/SoundCloud and generic gallery/video policy filtering is implemented at the common candidate layer. YouTube adaptive video/audio is delegated to the upstream background mux job, and HLS/DASH manifests are delegated to the upstream highest-quality reconstruction job rather than saved directly. Original-artwork discovery and Pixiv ugoira reconstruction are not independently expanded. DMM content certainty relies on generic semantic filtering. These sites need live-site validation because fixtures cannot prove current private page structures.

No AMO credentials were present or sought. No DRM bypass was implemented.

Privacy correction: generated XPI files are Git-ignored because the installable package necessarily embeds the local site list. The local artifact is generated in Cloud, while only its checksum is tracked.
