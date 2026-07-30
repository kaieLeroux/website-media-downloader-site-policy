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

if (typeof browser === 'undefined') {
    var browser = chrome;
}

async function initTheme() {
    const result = await browser.storage.local.get(['theme-color', 'theme-mode']);
    const themeColor = result['theme-color'] || '#bbdefb';
    const themeMode = result['theme-mode'] || 'auto';

    if (typeof mdui !== 'undefined' && mdui.setColorScheme) {
        mdui.setColorScheme(themeColor);
    }

    const htmlEl = document.documentElement;
    htmlEl.classList.remove('mdui-theme-auto', 'mdui-theme-light', 'mdui-theme-dark', 'theme-pitch-black');
    
    if (themeMode === 'auto') {
        htmlEl.classList.add('mdui-theme-auto');
    } else if (themeMode === 'light') {
        htmlEl.classList.add('mdui-theme-light');
    } else if (themeMode === 'dark') {
        htmlEl.classList.add('mdui-theme-dark');
    } else if (themeMode === 'pitch-black') {
        htmlEl.classList.add('mdui-theme-dark');
        htmlEl.classList.add('theme-pitch-black');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await initTheme();
    // Keep service worker alive during download
    const heartbeatInterval = setInterval(() => {
        browser.runtime.sendMessage({ action: 'heartbeat' }).catch(() => {});
    }, 15000);

    window.addEventListener('beforeunload', () => {
        clearInterval(heartbeatInterval);
    });

    const colorResult = await browser.storage.local.get('ui-scale');
    if (colorResult['ui-scale']) {
        document.documentElement.style.zoom = colorResult['ui-scale'];
    }

    browser.storage.onChanged.addListener((changes) => {
        if (changes['theme-color'] || changes['theme-mode']) {
            initTheme();
        }
        if (changes['ui-scale']) {
            document.documentElement.style.zoom = changes['ui-scale'].newValue || '100%';
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const streamUrl = urlParams.get('url');
    const size = urlParams.get('size');
    const audioOnly = urlParams.get('audioOnly') === 'true';

    if (!streamUrl) {
        document.getElementById('status-header').textContent = browser.i18n.getMessage("downloadErrorTitle");
        document.getElementById('status-text').textContent = browser.i18n.getMessage("streamNoUrlError");
        return;
    }

    const loadingBar = document.getElementById('stream-progress');
    const statusHeader = document.getElementById('status-header');
    const statusText = document.getElementById('status-text');
    const mediaTitle = document.getElementById('media-title');
    const actionArea = document.getElementById('action-area');
    const closeButton = document.getElementById('close-button');

    closeButton.addEventListener('click', () => window.close());

    try {

        const isYoutube = urlParams.get('youtube') === 'true';
        const audioUrl = urlParams.get('audioUrl');
        const customFilename = urlParams.get('filename');
        mediaTitle.textContent = customFilename || getFileName(streamUrl);
        statusHeader.textContent = browser.i18n.getMessage("streamDownloadingTitle");

        const downloadMethod = await browser.storage.local.get('download-method').then(res => res['download-method'] || 'browser');

        if (isYoutube) {
            if (audioOnly) {
                await downloadDirectFile(streamUrl, customFilename, downloadMethod, loadingBar);
            } else {
                await downloadAndMuxYoutube(streamUrl, audioUrl, customFilename, downloadMethod, loadingBar);
            }
        } else {
            const mediaRequests = await browser.runtime.sendMessage({ action: 'getMediaRequests' });
            const requests = mediaRequests[streamUrl] || [];

            const request = requests.find(r => r.size === size) || requests[0] || {};
            const headers = request.requestHeaders || [];

            if (streamUrl.toLowerCase().includes('.m3u8')) {
                await downloadM3U8Offline(streamUrl, headers, downloadMethod, loadingBar, request, customFilename, audioOnly);
            } else if (streamUrl.toLowerCase().includes('.mpd')) {
                await downloadMPDOffline(streamUrl, headers, downloadMethod, loadingBar, request, customFilename);
            } else {
                await downloadDirectFile(streamUrl, customFilename || getFileName(streamUrl), downloadMethod, loadingBar, headers, request);
            }
        }

        statusHeader.textContent = browser.i18n.getMessage("streamDownloadCompleteTitle") || "Download Complete";
        statusText.textContent = browser.i18n.getMessage("streamDownloadSaved") || "File has been saved.";
        loadingBar.value = 100;
        loadingBar.removeAttribute('indeterminate');
        actionArea.style.display = 'block';

    } catch (error) {
        console.error("Stream download failed:", error);
        statusHeader.textContent = browser.i18n.getMessage("downloadErrorTitle");
        statusText.textContent = error.message;
        loadingBar.style.display = 'none';
        actionArea.style.display = 'block';
    }
});

async function downloadDirectFile(url, filename, downloadMethod, loadingBar, headers = [], request = {}) {
    const statusInfo = loadingBar ? loadingBar.parentNode.querySelector('.download-status-info') : null;
    if (statusInfo) statusInfo.textContent = "Downloading...";
    if (loadingBar) loadingBar.setAttribute('indeterminate', 'true');

    const fetchOptions = {
        headers: Object.fromEntries((headers || []).map(h => [h.name, h.value])),
        method: request.method || 'GET',
        referrer: request.referrer || "",
    };

    if (request.method && request.method !== 'GET' && request.requestBody) {
        if (request.requestBody.type === 'formData') {
            const formData = new FormData();
            for (const key in request.requestBody.data) {
                request.requestBody.data[key].forEach(val => formData.append(key, val));
            }
            fetchOptions.body = formData;
        } else if (request.requestBody.type === 'base64') {
            const bin = atob(request.requestBody.data);
            const u = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            fetchOptions.body = u;
        }
    }

    const response = await fetch(url, fetchOptions);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const contentLength = response.headers.get('content-length');
    const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

    if (totalSize && loadingBar) {
        loadingBar.removeAttribute('indeterminate');
        loadingBar.max = totalSize;
        loadingBar.value = 0;
    }

    const reader = response.body.getReader();
    let receivedLength = 0;
    const chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;

        if (totalSize && loadingBar) {
            loadingBar.value = receivedLength;
        }
        if (statusInfo) {
            const loadedMB = (receivedLength / 1048576).toFixed(1);
            const totalMB = totalSize ? (totalSize / 1048576).toFixed(1) : 'unknown';
            statusInfo.textContent = `Downloading: ${loadedMB}MB / ${totalMB}MB`;
        }
    }

    const blob = new Blob(chunks);
    const blobUrl = URL.createObjectURL(blob);

    await browser.downloads.download({
        url: blobUrl,
        filename: filename,
        saveAs: false
    });
}

function getFileName(url, maxLength = 30) {
    try {
        let parsedUrl = new URL(url);
        let fileName = parsedUrl.pathname.substring(parsedUrl.pathname.lastIndexOf('/') + 1).split('?')[0];
        fileName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
        if (!fileName) fileName = parsedUrl.hostname;
        if (fileName.length > maxLength) fileName = fileName.substring(0, maxLength) + '…';
        return decodeURIComponent(fileName);
    } catch (e) { return browser.i18n.getMessage("defaultMediaName") || "Media File"; }
}

function showDialog(message, title) {
    mdui.alert({
        headline: title,
        description: message,
        confirmText: "OK"
    });
}
