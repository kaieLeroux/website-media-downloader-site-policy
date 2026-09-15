/* Candidate settling and conservative automatic download coordinator. */
(function (root, factory) {
    const api = factory(root.SitePolicy || (typeof require === 'function' ? require('./site_policy') : null));
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.AutoArchive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (SitePolicy) {
    class Coordinator {
        constructor(download, clock = globalThis) { this.download = download; this.clock = clock; this.groups = new Map(); this.completed = new Set(); }
        add(candidate, policy) {
            if (!SitePolicy.shouldAcceptCandidate(candidate, policy) || !policy.autoDownload) return false;
            const id = SitePolicy.mediaIdentity(candidate);
            if (this.completed.has(id)) return false;
            const now = Date.now(), state = this.groups.get(id) || { candidates: [], first: now, timer: null, policy };
            state.candidates.push(candidate); state.policy = policy;
            if (state.timer) this.clock.clearTimeout(state.timer);
            const delay = Math.min(policy.quietWindowMs || 3000, Math.max(0, (policy.maxWaitMs || 15000) - (now - state.first)));
            state.timer = this.clock.setTimeout(() => this.flush(id), delay); this.groups.set(id, state); return true;
        }
        async flush(id) {
            const state = this.groups.get(id); if (!state) return null;
            this.groups.delete(id); const best = SitePolicy.selectBestCandidate(state.candidates, state.policy); if (!best) return null;
            const result = await this.download(best, state.policy);
            if (result !== false) this.completed.add(id);
            return result === false ? null : best;
        }
        flushAll() { return Promise.all([...this.groups.keys()].map(id => this.flush(id))); }
    }
    return { Coordinator };
});
