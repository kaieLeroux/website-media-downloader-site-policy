/*
    website-media-downloader - A versatile tool to detect and download videos, music, and streams from almost any website.
    Copyright (C) 2026 anpa26

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

(() => {
    if (window.mdu_page_injected) return;
    window.mdu_page_injected = true;

    window.mdu_optimize_low_end = false;

    // 1. DRM detection hook
    try {
        const originalRequestMediaKeySystemAccess = navigator.requestMediaKeySystemAccess;
        if (originalRequestMediaKeySystemAccess && !navigator.mdu_hooked) {
            navigator.requestMediaKeySystemAccess = function() {
                window.postMessage({ type: 'MDU_DRM_DETECTED' }, '*');
                return originalRequestMediaKeySystemAccess.apply(this, arguments);
            };
            navigator.mdu_hooked = true;
        }
    } catch (e) {}

    // 2. Attach Shadow DOM hook
    try {
        const originalAttachShadow = Element.prototype.attachShadow;
        if (originalAttachShadow && !Element.prototype.mdu_hooked) {
            Element.prototype.attachShadow = function(init) {
                const shadowRoot = originalAttachShadow.apply(this, arguments);
                if (window.mdu_optimize_low_end) return shadowRoot;
                
                window.postMessage({ type: 'MDU_DOM_CHANGED' }, '*');
                try {
                    const observer = new MutationObserver(() => {
                        window.postMessage({ type: 'MDU_DOM_CHANGED' }, '*');
                    });
                    observer.observe(shadowRoot, { childList: true, subtree: true });
                } catch (e) {}
                return shadowRoot;
            };
            Element.prototype.mdu_hooked = true;
        }
    } catch (e) {}

    // 3. WebSocket hook
    try {
        const OriginalWebSocket = window.WebSocket;
        const detectedWs = new Set();
        window.WebSocket = function(url, protocols) {
            const ws = new OriginalWebSocket(url, protocols);
            
            const checkMedia = async (data) => {
                if (window.mdu_optimize_low_end) return;
                if (detectedWs.has(url)) return;
                
                try {
                    let buffer;
                    if (data instanceof ArrayBuffer) {
                        buffer = data;
                    } else if (window.Blob && data instanceof Blob) {
                        buffer = await data.slice(0, 10).arrayBuffer();
                    }

                    if (buffer && buffer.byteLength >= 3) {
                        const view = new Uint8Array(buffer);
                        
                        const isNAL = (view[0] === 0 && view[1] === 0 && view[2] === 1) || 
                                     (view.byteLength >= 4 && view[0] === 0 && view[1] === 0 && view[2] === 0 && view[3] === 1);
                        
                        if (isNAL) {
                            detectedWs.add(url);
                            window.postMessage({ type: 'MDU_WS_STREAM_DETECTED', url: url }, '*');
                        }
                    }
                } catch (e) {}
            };

            ws.addEventListener('message', (event) => {
                checkMedia(event.data);
            });

            return ws;
        };
        window.WebSocket.prototype = OriginalWebSocket.prototype;
        Object.assign(window.WebSocket, OriginalWebSocket);
    } catch (e) {}

    // 4. Deep scan function
    window.mdu_deep_scan = function() {
        const urls = [];
        try {
            if (window.__additionalData) {
                const findInObj = (obj, d = 0) => {
                    if (d > 10 || !obj || typeof obj !== 'object') return;
                    for (let k in obj) {
                        if (typeof obj[k] === 'string' && (obj[k].includes('.mp4') || obj[k].includes('.cdninstagram.com')) && obj[k].startsWith('http')) {
                            urls.push(obj[k]);
                        } else if (typeof obj[k] === 'object') findInObj(obj[k], d + 1);
                    }
                };
                findInObj(window.__additionalData);
            }
            if (window.SIGI_STATE) {
                if (window.SIGI_STATE.ItemModule) {
                    Object.values(window.SIGI_STATE.ItemModule).forEach(item => {
                        if (item.video) {
                            if (item.video.downloadAddr) urls.push(item.video.downloadAddr);
                            if (item.video.playAddr) urls.push(item.video.playAddr);
                        }
                    });
                }
            }
        } catch (e) {}
        if (urls.length > 0) {
            window.postMessage({ type: 'MDU_DEEP_URLS_DETECTED', urls: urls }, '*');
        }
    };

    // 5. Message listener from Isolated World
    window.addEventListener('message', (event) => {
        if (!event.data) return;
        if (event.data.type === 'MDU_TRIGGER_DEEP_SCAN') {
            if (window.mdu_deep_scan) window.mdu_deep_scan();
        } else if (event.data.type === 'MDU_UPDATE_SETTINGS') {
            window.mdu_optimize_low_end = !!event.data.optimizeLowEnd;
        }
    });
})();
