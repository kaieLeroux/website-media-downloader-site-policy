/* Site Policy engine for the WMD personal fork. GPL-3.0-or-later. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SitePolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const DEFAULTS = Object.freeze({ enabled: false, autoDownload: false, highestQualityOnly: true,
        media: { video: false, audio: false, stream: false, image: 'NONE', subtitle: false },
        silent: true, quietWindowMs: 3000, maxWaitMs: 15000, drm: 'SKIP' });
    let policies = [];

    function normalize(policy) {
        return { ...DEFAULTS, ...policy, media: { ...DEFAULTS.media, ...(policy.media || {}) } };
    }
    function configure(input) {
        policies = (Array.isArray(input) ? input : input?.policies || []).map((p, index) => ({ ...normalize(p), _index: index }));
        return policies.length;
    }
    function hostnameMatches(hostname, domain) {
        const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
        const d = String(domain || '').toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
        return !!d && (h === d || h.endsWith('.' + d));
    }
    function matchSitePolicy(rawUrl) {
        let url;
        try { url = new URL(rawUrl); } catch (_) { return null; }
        if (!/^https?:$/.test(url.protocol)) return null;
        const matches = policies.filter(p => (p.domains || []).some(d => hostnameMatches(url.hostname, d)) &&
            (!p.pathPrefix || url.pathname.startsWith(p.pathPrefix)));
        matches.sort((a, b) => (b.priority || 0) - (a.priority || 0) ||
            (b.pathPrefix?.length || 0) - (a.pathPrefix?.length || 0) || b._index - a._index);
        return matches[0] || null;
    }
    function mediaType(candidate) {
        if (candidate.type) return candidate.type === 'images' ? 'image' : candidate.type;
        const u = String(candidate.url || '').toLowerCase().split(/[?#]/)[0];
        if (/\.(m3u8|mpd)$/.test(u)) return 'stream';
        if (/\.(vtt|srt|ass|ttml)$/.test(u)) return 'subtitle';
        if (/\.(jpe?g|png|webp|gif)$/.test(u)) return 'image';
        if (/\.(mp3|m4a|aac|flac|opus|ogg|wav)$/.test(u)) return 'audio';
        return 'video';
    }
    function isSegment(candidate) { return /\.(ts|m4s)(?:$|[?#])/i.test(candidate.url || '') || candidate.segment === true; }
    function shouldAcceptCandidate(candidate, policy) {
        if (!policy?.enabled || candidate?.drm || policy.drm !== 'SKIP' || isSegment(candidate)) return false;
        const type = mediaType(candidate);
        const rule = policy.media[type];
        if (!rule || rule === 'NONE') return false;
        if (type === 'image' && /(?:avatar|emoji|icon|logo|sprite|thumbnail|thumb|navigation|advert)/i.test(`${candidate.role || ''} ${candidate.url || ''}`)) return false;
        return true;
    }
    function score(c) { return (Number(c.height) || 0) * (Number(c.width) || 0) * 1e6 + (Number(c.bitrate) || 0) * 100 + (Number(c.contentLength) || 0); }
    function selectBestCandidate(group, policy) {
        const accepted = (group || []).filter(c => shouldAcceptCandidate(c, policy));
        if (!accepted.length) return null;
        return accepted.sort((a, b) => score(b) - score(a))[0];
    }
    function normalizeMediaUrl(raw) {
        try { const u = new URL(raw); ['token','sig','signature','expires','expire','auth','auth_token'].forEach(k => u.searchParams.delete(k)); u.hash = ''; return u.toString(); }
        catch (_) { return String(raw || '').split('#')[0]; }
    }
    function mediaIdentity(c) { return c.contentId || c.manifestId || [c.pageUrl || '', normalizeMediaUrl(c.url || ''), mediaType(c)].join('|'); }
    return { DEFAULTS, configure, hostnameMatches, matchSitePolicy, shouldAcceptCandidate, selectBestCandidate, normalizeMediaUrl, mediaIdentity, mediaType, isSegment };
});
