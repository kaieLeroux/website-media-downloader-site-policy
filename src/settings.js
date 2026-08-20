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

const getRedirectURL = () => {
    if (typeof browser !== 'undefined' && browser.identity && typeof browser.identity.getRedirectURL === 'function') {
        return browser.identity.getRedirectURL();
    }
    const id = browser.runtime.id;
    if (id && id.includes('@')) {
        return `https://${encodeURIComponent(id)}.extensions.allizom.org/`;
    }
    return "https://924f7c81-8b1e-4b6e-9e7c-8e4a9e1d2c3f.extensions.allizom.org/";
};

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

let settingsPageInitPromise = null;
window.initializeSettingsPage = function initializeSettingsPage() {
  if (settingsPageInitPromise) return settingsPageInitPromise;
  settingsPageInitPromise = (async () => {
    await initTheme();

    const cloudLocationSelect = document.getElementById('cloud-save-location');
    const gdriveDetails = document.getElementById('gdrive-details-container');
    const dropboxDetails = document.getElementById('dropbox-details-container');

        async function updateCloudVisibility() {
        const res = await browser.storage.local.get(['save-to-gdrive', 'save-to-dropbox']);
        let gdriveVal = pendingChanges['save-to-gdrive'] !== undefined ? pendingChanges['save-to-gdrive'] : res['save-to-gdrive'];
        let dropboxVal = pendingChanges['save-to-dropbox'] !== undefined ? pendingChanges['save-to-dropbox'] : res['save-to-dropbox'];

        let val = 'local';
        if (gdriveVal === '1') val = 'gdrive';
        if (dropboxVal === '1') val = 'dropbox';

        if (cloudLocationSelect) {
            if (cloudLocationSelect.value !== val) {
                cloudLocationSelect.value = val;
            }
        }

        const gdriveStream = document.getElementById('gdrive-stream');
        const dropboxStream = document.getElementById('dropbox-stream');

        if (gdriveStream) {
            gdriveStream.disabled = val !== 'gdrive';
            if (gdriveStream.disabled && gdriveStream.checked) {
                gdriveStream.checked = false;
                gdriveStream.dispatchEvent(new Event('change'));
            }
        }
        if (dropboxStream) {
            dropboxStream.disabled = val !== 'dropbox';
            if (dropboxStream.disabled && dropboxStream.checked) {
                dropboxStream.checked = false;
                dropboxStream.dispatchEvent(new Event('change'));
            }
        }

        if (val === 'gdrive') {
            if (gdriveDetails) gdriveDetails.style.display = 'flex';
            if (dropboxDetails) dropboxDetails.style.display = 'none';
        } else if (val === 'dropbox') {
            if (gdriveDetails) gdriveDetails.style.display = 'none';
            if (dropboxDetails) dropboxDetails.style.display = 'flex';
        } else {
            if (gdriveDetails) gdriveDetails.style.display = 'none';
            if (dropboxDetails) dropboxDetails.style.display = 'none';
        }
    }

    if (cloudLocationSelect) {
        cloudLocationSelect.addEventListener('change', async (e) => {
            const val = e.target.value;
            if (val === 'local') {
                pendingChanges['save-to-gdrive'] = '0';
                pendingChanges['save-to-dropbox'] = '0';
            } else if (val === 'gdrive') {
                pendingChanges['save-to-gdrive'] = '1';
                pendingChanges['save-to-dropbox'] = '0';
            } else if (val === 'dropbox') {
                pendingChanges['save-to-gdrive'] = '0';
                pendingChanges['save-to-dropbox'] = '1';
            }
            if (typeof showApplyBar === 'function') showApplyBar();
            updateCloudVisibility();
        });
    }

    updateCloudVisibility();

    await Promise.allSettled([
        customElements.whenDefined('mdui-switch'),
        customElements.whenDefined('mdui-segmented-button-group'),
        customElements.whenDefined('mdui-segmented-button')
    ]);
    await initializeSettings();
    setupConfirmationBar();
    setupSpeedTest();

    if (window.location.search.includes('startDropbox=true')) {
        const res = await browser.storage.local.get('dropbox_token');
        if (!res.dropbox_token) {
            const dropboxBtn = document.getElementById('dropbox-login-btn');
            if (dropboxBtn) dropboxBtn.click();
        }
    }

    if (window.location.search.includes('startGDrive=true')) {
        const res = await browser.storage.local.get('gdrive_token');
        if (!res.gdrive_token) {
            const gdriveBtn = document.getElementById('gdrive-login-btn');
            if (gdriveBtn) gdriveBtn.click();
        }
    }
  })();
  return settingsPageInitPromise;
};

let pendingChanges = {};
let isInitializing = false;

function setupConfirmationBar() {
    const bar = document.getElementById('settings-apply-bar');
    const applyBtn = document.getElementById('apply-settings');
    const cancelBtn = document.getElementById('cancel-settings');

    if (!bar || !applyBtn || !cancelBtn) return;

    applyBtn.addEventListener('click', async () => {
        if (Object.keys(pendingChanges).length === 0) return;
        applyBtn.loading = true;
        applyBtn.disabled = true;
        try {
            await browser.storage.local.set({ ...pendingChanges });
            pendingChanges = {};
            bar.style.display = 'none';
            if (typeof mdui !== 'undefined' && mdui.snackbar) {
                mdui.snackbar({
                    message: browser.i18n.getMessage('settingsSaved') || 'Settings saved',
                    placement: 'top'
                });
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            applyBtn.loading = false;
            applyBtn.disabled = false;
        }
    });

    cancelBtn.addEventListener('click', () => {
        pendingChanges = {};
        bar.style.display = 'none';
        initializeSettings();
    });
}

function showApplyBar() {
    if (isInitializing) return;
    const bar = document.getElementById('settings-apply-bar');
    if (bar) bar.style.display = 'flex';
}

async function initializeSettings() {
    isInitializing = true;

    const tempRes = await browser.storage.local.get('filename-template');
    if (tempRes['filename-template'] === '0') {
        await browser.storage.local.set({ 'filename-template': '' });
    }

    const settings = [
        'url-detection', 'youtube-detection', 'mime-detection', 'detect-download-links', 'hide-segments', 'hide-page-components', 'disable-deduplication', 'optimize-low-end', 'limit-media-list', 'limit-media-list-custom', 'min-file-size', 'min-file-size-custom',
        'only-video', 'only-audio', 'only-stream', 'only-image', 'only-subtitle', 'only-file', 'ignore-disabled-types',
        'media-notification', 'audio-process-notification', 'media-system-notification', 'stack-notifications', 'download-method', 'fetch-notification', 'media-cache', 'speed-boost', 'speed-boost-resume', 'connections', 'stream-download',
        'stream-quality', 'subtitle-conversion', 'mpd-fix', 'background-download', 'auto-resume', 'stream-to-mp4', 'audio-to-mp3', 'mp3-bitrate', 'open-preference', 'mux-all-audios', 'mpd-to-mp4',
        'embed-subtitles-mkv', 'embed-subtitles-container', 'embed-subtitles-nonyt',
        'filename-template', 'disable-rename-dialog', 'history-page', 'settings-layout', 'theme-mode', 'group-by-type', 'save-to-gdrive', 'gdrive-stream', 'media-sort-order',
        'save-to-dropbox', 'dropbox-stream', 'auto-check-update', 'badge-counter', 'ui-scale', 'ui-scale-custom'
    ];

    for (const setting of settings) {
        const result = await browser.storage.local.get(setting);
        let value = result[setting];

        if (value === undefined) {
            const defaultsEnabled = [
                'url-detection', 'youtube-detection', 'mime-detection', 'hide-page-components', 'hide-segments',
                'media-notification', 'audio-process-notification', 'media-system-notification', 'only-video', 'only-audio', 'only-stream', 'only-image', 'only-subtitle',
                'background-download', 'auto-resume', 'only-file', 'stream-to-mp4', 'audio-to-mp3', 'auto-check-update', 'badge-counter',
                'detect-download-links', 'disable-deduplication', 'fetch-notification', 'group-by-type'
            ];
            if (defaultsEnabled.includes(setting)) {
                value = '1';
                browser.storage.local.set({ [setting]: value });
            } else if (['ignore-disabled-types', 'history-page', 'save-to-gdrive', 'gdrive-stream', 'save-to-dropbox', 'dropbox-stream', 'stack-notifications', 'mux-all-audios', 'embed-subtitles-mkv', 'embed-subtitles-nonyt', 'mpd-to-mp4'].includes(setting)) {
                value = '0';
                browser.storage.local.set({ [setting]: value });
            } else if (setting === 'speed-boost' || setting === 'speed-boost-resume' || setting === 'disable-rename-dialog') {
                value = '0';
                browser.storage.local.set({ [setting]: value });
            } else if (setting === 'connections') {
                value = '4';
                browser.storage.local.set({ [setting]: value });
            } else if (setting === 'mp3-bitrate') {
                value = '320';
                browser.storage.local.set({ [setting]: value });
            } else if (setting === 'theme-mode') {
                value = 'auto';
                browser.storage.local.set({ [setting]: value });
            }
        }

        const element = document.getElementById(setting);
        if (!element) continue;

        if (element.tagName === 'MDUI-SWITCH') {
            element.checked = value === '1' || value === true;

            const updateConstraints = () => {
                const speedBoost = document.getElementById('speed-boost');
                const speedBoostResume = document.getElementById('speed-boost-resume');
                const connections = document.getElementById('connections');
                const autoResume = document.getElementById('auto-resume');
                const gdriveStream = document.getElementById('gdrive-stream');
                const onlyFile = document.getElementById('only-file');

                if (setting === 'audio-to-mp3') {
                    const mp3Bitrate = document.getElementById('mp3-bitrate');
                    if (mp3Bitrate) {
                        const item = mp3Bitrate.closest('.setting-item');
                        if (item) {
                            item.style.display = element.checked ? 'flex' : 'none';
                        }
                    }
                }

                if (setting === 'gdrive-stream' || setting === 'dropbox-stream') {
                    if (speedBoost) {
                        if (element.checked) {
                            speedBoost.checked = false;
                            speedBoost.disabled = true;
                            pendingChanges['speed-boost'] = '0';

                            if (speedBoostResume) {
                                speedBoostResume.checked = false;
                                speedBoostResume.disabled = true;
                                const item = speedBoostResume.closest('.setting-item');
                                if (item) item.style.display = 'none';
                                pendingChanges['speed-boost-resume'] = '0';
                            }
                            if (connections) {
                                connections.disabled = true;
                                const item = connections.closest('.setting-item');
                                if (item) item.style.display = 'none';
                            }

                            if (typeof showApplyBar === 'function') showApplyBar();
                        } else {
                            speedBoost.disabled = false;
                            if (speedBoostResume) {
                                speedBoostResume.disabled = !speedBoost.checked;
                                const item = speedBoostResume.closest('.setting-item');
                                if (item) item.style.display = speedBoost.checked ? 'flex' : 'none';
                            }
                            if (connections) {
                                connections.disabled = !speedBoost.checked;
                                const item = connections.closest('.setting-item');
                                if (item) item.style.display = speedBoost.checked ? 'flex' : 'none';
                            }
                        }
                    }
                }

                if (setting === 'speed-boost') {
                    if (!element.checked) {
                        if (speedBoostResume) {
                            speedBoostResume.checked = false;
                            speedBoostResume.disabled = true;
                            const item = speedBoostResume.closest('.setting-item');
                            if (item) item.style.display = 'none';
                            pendingChanges['speed-boost-resume'] = '0';
                        }
                        if (connections) {
                            connections.disabled = true;
                            const item = connections.closest('.setting-item');
                            if (item) item.style.display = 'none';
                        }
                    } else {
                        if (speedBoostResume) {
                            speedBoostResume.disabled = false;
                            const item = speedBoostResume.closest('.setting-item');
                            if (item) item.style.display = 'flex';
                        }
                        if (connections) {
                            connections.disabled = false;
                            const item = connections.closest('.setting-item');
                            if (item) item.style.display = 'flex';
                        }
                    }
                }

                if (setting === 'background-download') {
                    if (!element.checked) {
                        if (autoResume) {
                            autoResume.checked = false;
                            autoResume.disabled = true;
                            pendingChanges['auto-resume'] = '0';
                        }
                    } else {
                        if (autoResume) autoResume.disabled = false;
                    }
                }

                if (setting === 'save-to-gdrive') {
                    if (!element.checked) {
                        if (gdriveStream) {
                            gdriveStream.checked = false;
                            gdriveStream.disabled = true;
                            pendingChanges['gdrive-stream'] = '0';

                            const dbxStream = document.getElementById('dropbox-stream');
                            if (speedBoost && (!dbxStream || !dbxStream.checked)) {
                                speedBoost.disabled = false;
                                if (speedBoostResume) {
                                    speedBoostResume.disabled = !speedBoost.checked;
                                    const item = speedBoostResume.closest('.setting-item');
                                    if (item) item.style.display = speedBoost.checked ? 'flex' : 'none';
                                    if (speedBoostResume.disabled) {
                                        speedBoostResume.checked = false;
                                        pendingChanges['speed-boost-resume'] = '0';
                                    }
                                }
                                if (connections) {
                                    connections.disabled = !speedBoost.checked;
                                    const item = connections.closest('.setting-item');
                                    if (item) item.style.display = speedBoost.checked ? 'flex' : 'none';
                                }
                            }
                        }
                    } else {
                        if (gdriveStream) gdriveStream.disabled = false;
                    }
                }

                if (setting === 'save-to-dropbox') {
                    if (!element.checked) {
                        const dbxStream = document.getElementById('dropbox-stream');
                        if (dbxStream) {
                            dbxStream.checked = false;
                            dbxStream.disabled = true;
                            pendingChanges['dropbox-stream'] = '0';

                            const gdriveStream = document.getElementById('gdrive-stream');
                            const speedBoost = document.getElementById('speed-boost');
                            const speedBoostResume = document.getElementById('speed-boost-resume');
                            const connections = document.getElementById('connections');

                            if (speedBoost && (!gdriveStream || !gdriveStream.checked)) {
                                speedBoost.disabled = false;
                                if (speedBoostResume) {
                                    speedBoostResume.disabled = !speedBoost.checked;
                                    const item = speedBoostResume.closest('.setting-item');
                                    if (item) item.style.display = speedBoost.checked ? 'flex' : 'none';
                                    if (speedBoostResume.disabled) {
                                        speedBoostResume.checked = false;
                                        pendingChanges['speed-boost-resume'] = '0';
                                    }
                                }
                                if (connections) {
                                    connections.disabled = !speedBoost.checked;
                                    const item = connections.closest('.setting-item');
                                    if (item) item.style.display = speedBoost.checked ? 'flex' : 'none';
                                }
                            }
                        }
                    } else {
                        const dbxStream = document.getElementById('dropbox-stream');
                        if (dbxStream) dbxStream.disabled = false;
                    }
                }

                if (setting === 'detect-download-links') {
                    if (onlyFile) {
                        const item = onlyFile.closest('.setting-item');
                        if (item) {
                            item.style.display = element.checked ? 'flex' : 'none';
                            if (!element.checked) {
                                onlyFile.checked = false;
                                pendingChanges['only-file'] = '0';
                            }
                        }
                    }
                }

                if (setting === 'embed-subtitles-mkv' || setting === 'embed-subtitles-nonyt') {
                    const containerItem = document.getElementById('setting-embed-subtitles-container');
                    if (containerItem) {
                        containerItem.style.display = 'none';
                    }
                }

                if (setting === 'optimize-low-end') {
                    const limitSelect = document.getElementById('limit-media-list');
                    const limitCustom = document.getElementById('limit-media-list-custom');
                    if (element.checked) {
                        if (limitSelect) {
                            if (limitSelect.value !== '10') limitSelect.value = '10';
                            limitSelect.disabled = true;
                            pendingChanges['limit-media-list'] = '10';
                        }
                        if (limitCustom) {
                            limitCustom.disabled = true;
                            const item = limitCustom.closest('.setting-item');
                            if (item) item.style.display = 'none';
                        }
                        const cleanView = document.getElementById('clean-view');
                        if (cleanView && !cleanView.checked) {
                            cleanView.checked = true;
                            cleanView.dispatchEvent(new Event('change'));
                        }
                        const mediaCache = document.getElementById('media-cache');
                        if (mediaCache) {
                            if (mediaCache.checked) {
                                mediaCache.checked = false;
                                pendingChanges['media-cache'] = '0';
                            }
                            mediaCache.disabled = true;
                            try {
                                browser.runtime.sendMessage({ action: 'clearStorage' });
                            } catch(e) {}
                        }
                    } else {
                        if (limitSelect) {
                            limitSelect.disabled = false;
                            if (limitSelect.value === 'custom' && limitCustom) {
                                const item = limitCustom.closest('.setting-item');
                                if (item) item.style.display = 'flex';
                                limitCustom.disabled = false;
                            }
                        }
                        const mediaCache = document.getElementById('media-cache');
                        if (mediaCache) {
                            mediaCache.disabled = false;
                        }
                    }
                }
            };

            if (setting === 'gdrive-stream' || setting === 'speed-boost' || setting === 'background-download' || setting === 'save-to-gdrive' || setting === 'detect-download-links' || setting === 'optimize-low-end' || setting === 'embed-subtitles-mkv' || setting === 'audio-to-mp3') {
                const checkInitial = () => {
                    const speedBoost = document.getElementById('speed-boost');
                    const speedBoostResume = document.getElementById('speed-boost-resume');
                    const connections = document.getElementById('connections');
                    const gdriveStream = document.getElementById('gdrive-stream');
                    const backgroundDownload = document.getElementById('background-download');
                    const autoResume = document.getElementById('auto-resume');
                    const cloudSaveLocation = document.getElementById('cloud-save-location');
                    const detectDownloadLinks = document.getElementById('detect-download-links');
                    const onlyFile = document.getElementById('only-file');
                    const optimizeLowEnd = document.getElementById('optimize-low-end');
                    const limitSelect = document.getElementById('limit-media-list');
                    const limitCustom = document.getElementById('limit-media-list-custom');
                    const audioToMp3 = document.getElementById('audio-to-mp3');
                    const mp3Bitrate = document.getElementById('mp3-bitrate');

                    if (audioToMp3 && mp3Bitrate) {
                        const item = mp3Bitrate.closest('.setting-item');
                        if (item) {
                            item.style.display = audioToMp3.checked ? 'flex' : 'none';
                        }
                    }

                    if (speedBoost && speedBoostResume && connections && gdriveStream && backgroundDownload && autoResume && cloudSaveLocation && detectDownloadLinks && onlyFile) {
                        const dropboxStream = document.getElementById('dropbox-stream');

                        if (gdriveStream) {
                            gdriveStream.disabled = cloudSaveLocation.value !== 'gdrive';
                            if (gdriveStream.disabled) gdriveStream.checked = false;
                        }
                        if (dropboxStream) {
                            dropboxStream.disabled = cloudSaveLocation.value !== 'dropbox';
                            if (dropboxStream.disabled) dropboxStream.checked = false;
                        }

                        if ((gdriveStream && gdriveStream.checked) || (dropboxStream && dropboxStream.checked)) {
                            speedBoost.checked = false;
                            speedBoost.disabled = true;
                            if (speedBoostResume) {
                                speedBoostResume.checked = false;
                                speedBoostResume.disabled = true;
                                const item = speedBoostResume.closest('.setting-item');
                                if (item) item.style.display = 'none';
                            }
                            if (connections) {
                                connections.disabled = true;
                                const item = connections.closest('.setting-item');
                                if (item) item.style.display = 'none';
                            }
                        } else {
                            speedBoost.disabled = false;
                            if (speedBoostResume) {
                                speedBoostResume.disabled = !speedBoost.checked;
                                if (speedBoostResume.disabled) speedBoostResume.checked = false;
                                const item = speedBoostResume.closest('.setting-item');
                                if (item) item.style.display = speedBoost.checked ? 'flex' : 'none';
                            }
                            if (connections) {
                                connections.disabled = !speedBoost.checked;
                                const item = connections.closest('.setting-item');
                                if (item) item.style.display = speedBoost.checked ? 'flex' : 'none';
                            }
                        }

                        if (autoResume) {
                            autoResume.disabled = !backgroundDownload.checked;
                            if (autoResume.disabled) autoResume.checked = false;
                        }

                        if (onlyFile && detectDownloadLinks) {
                            const item = onlyFile.closest('.setting-item');
                            if (item) {
                                item.style.display = detectDownloadLinks.checked ? 'flex' : 'none';
                                if (!detectDownloadLinks.checked) onlyFile.checked = false;
                            }
                        }

                        if (optimizeLowEnd && limitSelect && limitCustom) {
                            if (optimizeLowEnd.checked) {
                                if (limitSelect.value !== '10') {
                                    limitSelect.value = '10';
                                }
                                limitSelect.disabled = true;
                                limitCustom.disabled = true;
                                const item = limitCustom.closest('.setting-item');
                                if (item) item.style.display = 'none';

                                const ignoreDisabled = document.getElementById('ignore-disabled-types');
                                if (ignoreDisabled && !ignoreDisabled.checked) {
                                    ignoreDisabled.checked = true;
                                    pendingChanges['ignore-disabled-types'] = '1';
                                }
                            }
                        }
                    } else {
                        setTimeout(checkInitial, 100);
                    }
                };
                checkInitial();
            }

            const handleChange = () => {
                pendingChanges[setting] = element.checked ? '1' : '0';
                if (setting === 'hide-segments') {
                    pendingChanges['hide-page-components'] = element.checked ? '1' : '0';
                }

                updateConstraints();
                showApplyBar();

                if (setting === 'background-download') {
                    syncNotificationSetting(element.checked);
                }

                if (setting === 'gdrive-stream' && element.checked) {
                    const downloadMethod = document.getElementById('download-method');
                    if (downloadMethod && downloadMethod.value === 'browser') {
                        if (typeof mdui !== 'undefined' && mdui.snackbar) {
                            mdui.snackbar({ message: (browser.i18n.getMessage("streamUploadMethodWarning") || "Note: Stream Upload works best with 'Fetch' download method."), placement: "top" });
                        }
                    }
                }

                if ((setting === 'save-to-dropbox' || setting === 'dropbox-stream') && element.checked) {
                    checkDropboxLogin();
                }

                if ((setting === 'save-to-gdrive' || setting === 'gdrive-stream') && element.checked) {
                    checkGDriveLogin();
    checkDropboxLogin();
                }
            };
            element.addEventListener('change', handleChange);
            continue;
        }

        if (element.tagName === 'MDUI-TEXT-FIELD' || (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'number'))) {
            const defVal = setting === 'limit-media-list-custom' ? '0' : '';
            element.value = (value !== undefined && value !== null && value !== '') ? value : defVal;
            element.oninput = () => {
                pendingChanges[setting] = element.value;
                showApplyBar();
            };
            if (setting === 'limit-media-list-custom') {
                element.addEventListener('blur', () => {
                    if (element.value.trim() === '') {
                        element.value = '0';
                        pendingChanges[setting] = '0';
                        if (!isInitializing) showApplyBar();
                    }
                });
            }
            continue;
        }

        if (element.tagName === 'MDUI-SELECT' || element.tagName === 'SELECT' || element.tagName === 'MDUI-SEGMENTED-BUTTON-GROUP') {
            const defaultValue = setting === 'limit-media-list' ? 'custom' :
                                (setting === 'settings-layout' ? 'tabs-icons' :
                                (setting === 'theme-mode' ? 'auto' :
                                (setting === 'open-preference' ? 'popup' :
                                (setting === 'download-method' ? 'fetch' :
                                (setting === 'stream-quality' ? 'highest' :
                                (setting === 'subtitle-conversion' ? 'none' :
                                (setting === 'embed-subtitles-container' ? 'mp4' :
                                (setting === 'connections' ? '4' :
                                (setting === 'media-sort-order' ? 'newest' :
                                (setting === 'mp3-bitrate' ? '320' :
                                (setting === 'min-file-size' ? '0' :
                                (setting === 'ui-scale' ? '85%' :
                                (setting === 'stream-download' ? 'offline' : 'stream'))))))))))))) ;

            element.value = value || defaultValue;
            element.addEventListener('change', () => {
                pendingChanges[setting] = element.value;
                showApplyBar();
                if (setting === 'theme-mode') {
                    const htmlEl = document.documentElement;
                    htmlEl.classList.remove('mdui-theme-auto', 'mdui-theme-light', 'mdui-theme-dark', 'theme-pitch-black');
                    if (element.value === 'auto') {
                        htmlEl.classList.add('mdui-theme-auto');
                    } else if (element.value === 'light') {
                        htmlEl.classList.add('mdui-theme-light');
                    } else if (element.value === 'dark') {
                        htmlEl.classList.add('mdui-theme-dark');
                    } else if (element.value === 'pitch-black') {
                        htmlEl.classList.add('mdui-theme-dark');
                        htmlEl.classList.add('theme-pitch-black');
                    }
                }
                if (setting === 'limit-media-list') {
                    const limitCustom = document.getElementById('limit-media-list-custom');
                    if (limitCustom) {
                        const item = limitCustom.closest('.setting-item');
                        if (item) item.style.display = element.value === 'custom' ? 'flex' : 'none';
                    }
                }
                if (setting === 'min-file-size') {
                    const minCustom = document.getElementById('min-file-size-custom');
                    if (minCustom) {
                        const item = minCustom.closest('.setting-item');
                        if (item) item.style.display = element.value === 'custom' ? 'flex' : 'none';
                    }
                }
                if (setting === 'settings-layout') {
                    applySettingsLayout(element.value);
                }
                if (setting === 'ui-scale') {
                    const scaleCustom = document.getElementById('setting-ui-scale-custom');
                    if (scaleCustom) {
                        scaleCustom.style.display = element.value === 'custom' ? 'flex' : 'none';
                    }
                    if (element.value === 'custom') {
                        const customVal = document.getElementById('ui-scale-custom')?.value || '80';
                        document.documentElement.style.zoom = customVal + '%';
                        pendingChanges['ui-scale'] = customVal + '%';
                    } else {
                        document.documentElement.style.zoom = element.value;
                    }
                }
                if (setting === 'ui-scale-custom') {
                    const scaleSelect = document.getElementById('ui-scale');
                    if (scaleSelect && scaleSelect.value === 'custom') {
                        document.documentElement.style.zoom = element.value + '%';
                        pendingChanges['ui-scale'] = element.value + '%';
                    }
                }
            });
            continue;
        }
    }

    const scaleSelectInitial = document.getElementById('ui-scale');
    const scaleCustomInitial = document.getElementById('setting-ui-scale-custom');
    if (scaleSelectInitial && scaleCustomInitial) {
        scaleCustomInitial.style.display = scaleSelectInitial.value === 'custom' ? 'flex' : 'none';
    }

    const limitSelectInitial = document.getElementById('limit-media-list');
    const limitCustomInitial = document.getElementById('limit-media-list-custom');
    const optimizeLowEndInitial = document.getElementById('optimize-low-end');
    if (limitSelectInitial && limitCustomInitial) {
        const item = limitCustomInitial.closest('.setting-item');
        if (item) {
            if (limitSelectInitial.value === 'custom' && (!optimizeLowEndInitial || !optimizeLowEndInitial.checked)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        }
    }

    const minSelectInitial = document.getElementById('min-file-size');
    const minCustomInitial = document.getElementById('min-file-size-custom');
    if (minSelectInitial && minCustomInitial) {
        const item = minCustomInitial.closest('.setting-item');
        if (item) {
            item.style.display = minSelectInitial.value === 'custom' ? 'flex' : 'none';
        }
    }


    const embedSubMkvInitial = document.getElementById('embed-subtitles-mkv');
    const embedSubNonYtInitial = document.getElementById('embed-subtitles-nonyt');
    const embedSubContainerInitial = document.getElementById('setting-embed-subtitles-container');
    if (embedSubContainerInitial) {
        embedSubContainerInitial.style.display = 'none';
    }


    if (optimizeLowEndInitial && optimizeLowEndInitial.checked) {
        const mediaCache = document.getElementById('media-cache');
        if (mediaCache) {
            mediaCache.disabled = true;
        }
    }

    const gdriveBtn = document.getElementById('gdrive-login-btn');
    const gdriveText = document.getElementById('gdrive-login-text');
    const gdriveUserInfo = document.getElementById('gdrive-user-info');
    const gdriveUserEmail = document.getElementById('gdrive-user-email');

    const dropboxBtn = document.getElementById('dropbox-login-btn');
    const dropboxText = document.getElementById('dropbox-login-text');
    const dropboxUserInfo = document.getElementById('dropbox-user-info');
    const dropboxUserEmail = document.getElementById('dropbox-user-email');

    async function checkDropboxLogin() {
        const res = await browser.storage.local.get('dropbox_token');

        const dropboxSaveContainer = document.getElementById('dropbox-save-container');
        const dropboxStreamContainer = document.getElementById('dropbox-stream-container');

        if (res.dropbox_token) {
            if (dropboxSaveContainer) dropboxSaveContainer.style.display = 'flex';
            if (dropboxStreamContainer) dropboxStreamContainer.style.display = 'flex';
            dropboxText.textContent = browser.i18n.getMessage("dropboxLogoutButton") || "Logout";
            if (dropboxBtn) dropboxBtn.variant = "outlined";

            const userRes = await browser.storage.local.get('dropbox_user');
            if (userRes.dropbox_user) {
                dropboxUserInfo.style.display = 'block';
                dropboxUserEmail.textContent = userRes.dropbox_user.email;
            }
        } else {
            dropboxText.textContent = browser.i18n.getMessage("dropboxLoginButton") || "Login";
            if (dropboxBtn) dropboxBtn.variant = "tonal";
            dropboxUserInfo.style.display = 'none';

            if (dropboxSaveContainer) dropboxSaveContainer.style.display = 'none';
            if (dropboxStreamContainer) dropboxStreamContainer.style.display = 'none';

            const current = await browser.storage.local.get('save-to-dropbox');
            if (current['save-to-dropbox'] === '1' || pendingChanges['save-to-dropbox'] === '1') {
                pendingChanges['save-to-dropbox'] = '0';
                await browser.storage.local.set({ 'save-to-dropbox': '0' });

                const select = document.getElementById('cloud-save-location');
                if (select && select.value === 'dropbox') {
                    select.value = 'local';
                    select.dispatchEvent(new Event('change'));
                }
                const dropboxDetails = document.getElementById('dropbox-details-container');
                if (dropboxDetails) dropboxDetails.style.display = 'none';
            }
        }
    }

    async function checkGDriveLogin() {
        const res = await browser.storage.local.get('gdrive_token');

        const gdriveSaveContainer = document.getElementById('gdrive-save-container');
        const gdriveStreamContainer = document.getElementById('gdrive-stream-container');

        if (res.gdrive_token) {
            if (gdriveSaveContainer) gdriveSaveContainer.style.display = 'flex';
            if (gdriveStreamContainer) gdriveStreamContainer.style.display = 'flex';
            gdriveText.textContent = browser.i18n.getMessage("gdriveLogoutButton") || "Logout";
            gdriveBtn.variant = "outlined";

            const userRes = await browser.storage.local.get('gdrive_user');
            if (userRes.gdrive_user) {
                gdriveUserInfo.style.display = 'block';
                gdriveUserEmail.textContent = userRes.gdrive_user.email;
            }
        } else {
            gdriveText.textContent = browser.i18n.getMessage("gdriveLoginButton") || "Login";
            gdriveBtn.variant = "tonal";
            gdriveUserInfo.style.display = 'none';

            if (gdriveSaveContainer) gdriveSaveContainer.style.display = 'none';
            if (gdriveStreamContainer) gdriveStreamContainer.style.display = 'none';

            const current = await browser.storage.local.get('save-to-gdrive');
            if (current['save-to-gdrive'] === '1' || pendingChanges['save-to-gdrive'] === '1') {
                pendingChanges['save-to-gdrive'] = '0';
                await browser.storage.local.set({ 'save-to-gdrive': '0' });

                const select = document.getElementById('cloud-save-location');
                if (select && select.value === 'gdrive') {
                    select.value = 'local';

                    select.dispatchEvent(new Event('change'));
                }
                const gdriveDetails = document.getElementById('gdrive-details-container');
                if (gdriveDetails) gdriveDetails.style.display = 'none';
            }
        }
    }

    if (gdriveBtn) {
        gdriveBtn.onclick = async () => {
            const res = await browser.storage.local.get('gdrive_token');
            if (res.gdrive_token) {
                await browser.storage.local.remove(['gdrive_token', 'gdrive_user']);
                checkGDriveLogin();
                if (typeof mdui !== 'undefined' && mdui.snackbar) {
                    mdui.snackbar({ message: "Logged out from Google Drive", placement: "top" });
                }
            } else {
                let isPopup = window.location.pathname.endsWith('popup.html') && !window.location.search.includes('options=true');

                try {
                    const clientId = "1042907477337-c8h27qniercjia05jqqafgvjao514n28.apps.googleusercontent.com";
                    const finalRedirectUri = getRedirectURL();
                    const scope = encodeURIComponent("https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email");
                    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(finalRedirectUri)}&scope=${scope}&prompt=select_account`;

                    const normalizedRedirectUri = finalRedirectUri.endsWith('/') ? finalRedirectUri.slice(0, -1) : finalRedirectUri;

                    if (isPopup) {
                        await browser.tabs.create({ url: 'popup.html?options=true&startGDrive=true' });
                        window.close();
                        return;
                    }

                    let token = await new Promise((resolve, reject) => {
                        let isResolved = false;
                        let authTabId = null;

                        const updatedListener = async (tabId, changeInfo, tab) => {
                            const urlString = changeInfo.url || tab.url;
                            if (urlString && urlString.includes(normalizedRedirectUri) && urlString.includes('access_token=')) {
                                const url = new URL(urlString);
                                const hashParams = new URLSearchParams(url.hash.substring(1));
                                const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');

                                if (accessToken && !isResolved) {
                                    isResolved = true;
                                    browser.tabs.remove(tabId).catch(() => {});
                                    cleanup();
                                    resolve(accessToken);
                                }
                            }
                        };

                        const removedListener = (tabId) => {
                            if (authTabId && tabId === authTabId && !isResolved) {
                                isResolved = true;
                                cleanup();
                                reject(new Error("Login tab closed by user"));
                            }
                        };

                        const cleanup = () => {
                            browser.tabs.onUpdated.removeListener(updatedListener);
                            browser.tabs.onRemoved.removeListener(removedListener);
                        };

                        browser.tabs.onUpdated.addListener(updatedListener);
                        browser.tabs.onRemoved.addListener(removedListener);

                        if (typeof browser !== 'undefined' && browser.identity && typeof browser.identity.launchWebAuthFlow === 'function') {
                            browser.identity.launchWebAuthFlow({
                                url: authUrl,
                                interactive: true
                            }).then(redirectUrl => {
                                if (redirectUrl && !isResolved) {
                                    const url = new URL(redirectUrl);
                                    const hashParams = new URLSearchParams(url.hash.substring(1));
                                    const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
                                    if (accessToken) {
                                        isResolved = true;
                                        cleanup();
                                        resolve(accessToken);
                                    }
                                }
                            }).catch(e => {
                                console.log("launchWebAuthFlow error:", e);
                            });
                        } else {
                            browser.tabs.create({ url: authUrl }).then(tab => {
                                authTabId = tab.id;
                            }).catch(e => {
                                console.log("browser.tabs.create error:", e);
                                if (!isResolved) {
                                    isResolved = true;
                                    cleanup();
                                    reject(e);
                                }
                            });
                        }
                    });

                    if (token) {
                        await browser.storage.local.set({ gdrive_token: token });

                        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const userData = await userResponse.json();
                        await browser.storage.local.set({ gdrive_user: userData });

                        checkGDriveLogin();

                        if (window.location.pathname.endsWith('popup.html') && !window.location.search.includes('options=true')) {
                            await browser.tabs.create({ url: 'popup.html?options=true' });
                            window.close();
                        }

                        if (typeof mdui !== 'undefined' && mdui.snackbar) {
                            mdui.snackbar({ message: "Successfully logged in to Google Drive", placement: "top" });
                        }
                    }

                } catch (error) {
                    console.error("GDrive Login Error:", error);
                    if (typeof mdui !== 'undefined' && mdui.snackbar) {
                        mdui.snackbar({ message: "Login failed: " + error.message, placement: "top" });
                    }
                }
            }
        };
        checkGDriveLogin();
    }

    if (dropboxBtn) {
        dropboxBtn.onclick = async () => {
            const res = await browser.storage.local.get('dropbox_token');
            if (res.dropbox_token) {
                await browser.storage.local.remove(['dropbox_token', 'dropbox_user']);
                checkDropboxLogin();
                if (typeof mdui !== 'undefined' && mdui.snackbar) {
                    mdui.snackbar({ message: "Logged out from Dropbox", placement: "top" });
                }
            } else {
                let isPopup = window.location.pathname.endsWith('popup.html') && !window.location.search.includes('options=true');

                try {
                    const clientId = "gipboqpkook5oaj";
                    let finalRedirectUri;
                    if (typeof browser !== 'undefined' && browser.identity && typeof browser.identity.getRedirectURL === 'function') {
                        finalRedirectUri = browser.identity.getRedirectURL();
                    } else {
                        const id = browser.runtime.id;
                        if (id && id.includes('@')) {
                            finalRedirectUri = "https://" + encodeURIComponent(id) + ".extensions.allizom.org/";
                        } else {
                            finalRedirectUri = "https://924f7c81-8b1e-4b6e-9e7c-8e4a9e1d2c3f.extensions.allizom.org/";
                        }
                    }

                    const authUrl = "https://www.dropbox.com/oauth2/authorize?client_id=" + clientId + "&response_type=token&redirect_uri=" + encodeURIComponent(finalRedirectUri);
                    const normalizedRedirectUri = finalRedirectUri.endsWith('/') ? finalRedirectUri.slice(0, -1) : finalRedirectUri;

                    if (isPopup) {
                        await browser.tabs.create({ url: 'popup.html?options=true&startDropbox=true' });
                        window.close();
                        return;
                    }

                    let token = await new Promise((resolve, reject) => {
                        let isResolved = false;
                        let authTabId = null;

                        const updatedListener = async (tabId, changeInfo, tab) => {
                            const urlString = changeInfo.url || tab.url;
                            if (urlString && urlString.includes(normalizedRedirectUri) && urlString.includes('access_token=')) {
                                const url = new URL(urlString);
                                const hashParams = new URLSearchParams(url.hash.substring(1));
                                const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');

                                if (accessToken && !isResolved) {
                                    isResolved = true;
                                    browser.tabs.remove(tabId).catch(() => {});
                                    cleanup();
                                    resolve(accessToken);
                                }
                            }
                        };

                        const removedListener = (tabId) => {
                            if (authTabId && tabId === authTabId && !isResolved) {
                                isResolved = true;
                                cleanup();
                                reject(new Error("Login tab closed by user"));
                            }
                        };

                        const cleanup = () => {
                            browser.tabs.onUpdated.removeListener(updatedListener);
                            browser.tabs.onRemoved.removeListener(removedListener);
                        };

                        browser.tabs.onUpdated.addListener(updatedListener);
                        browser.tabs.onRemoved.addListener(removedListener);

                        if (typeof browser !== 'undefined' && browser.identity && typeof browser.identity.launchWebAuthFlow === 'function') {
                            browser.identity.launchWebAuthFlow({
                                url: authUrl,
                                interactive: true
                            }).then(redirectUrl => {
                                if (redirectUrl && !isResolved) {
                                    const url = new URL(redirectUrl);
                                    const hashParams = new URLSearchParams(url.hash.substring(1));
                                    const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
                                    if (accessToken) {
                                        isResolved = true;
                                        cleanup();
                                        resolve(accessToken);
                                    }
                                }
                            }).catch(e => {
                                console.log("launchWebAuthFlow error:", e);
                            });
                        } else {
                            browser.tabs.create({ url: authUrl }).then(tab => {
                                authTabId = tab.id;
                            }).catch(e => {
                                console.log("browser.tabs.create error:", e);
                                if (!isResolved) {
                                    isResolved = true;
                                    cleanup();
                                    reject(e);
                                }
                            });
                        }
                    });

                    if (token) {
                        await browser.storage.local.set({ dropbox_token: token });

                        const userResponse = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
                            method: 'POST',
                            headers: { 'Authorization': "Bearer " + token }
                        });
                        if (userResponse.ok) {
                            const userData = await userResponse.json();
                            await browser.storage.local.set({ dropbox_user: { email: userData.email, name: userData.name.display_name } });
                        }

                        checkDropboxLogin();

                        if (typeof mdui !== 'undefined' && mdui.snackbar) {
                            mdui.snackbar({ message: "Successfully logged in to Dropbox!", placement: "top" });
                        }
                    }
                } catch (e) {
                    console.error("Dropbox Login Error", e);
                    if (typeof mdui !== 'undefined' && mdui.snackbar) {
                        mdui.snackbar({ message: "Login failed: " + e.message, placement: "top" });
                    }
                }
            }
        };
        checkDropboxLogin();
    }

    const layoutResult = await browser.storage.local.get('settings-layout');
    let layoutVal = layoutResult['settings-layout'] || 'tabs-icons';
    if (!layoutResult['settings-layout']) {
        const cleanViewResult = await browser.storage.local.get('clean-view');
        if (cleanViewResult['clean-view'] === '1') {
            layoutVal = 'clean';
        }
    }
    applySettingsLayout(layoutVal);

    setupCollapsibleLogic();

    const colorResult = await browser.storage.local.get('theme-color');

    const autoGenBtn = document.getElementById('auto-generate-template');
    const filenameInput = document.getElementById('filename-template');
    const disableRenameSwitch = document.getElementById('disable-rename-dialog');

    const updateDisableRenameState = () => {

        if (disableRenameSwitch) {
            disableRenameSwitch.disabled = false;
        }
    };

    if (filenameInput) {
        filenameInput.addEventListener('input', updateDisableRenameState);

        setTimeout(updateDisableRenameState, 100);
    }

    if (autoGenBtn && filenameInput) {
        autoGenBtn.onclick = () => {
            const defaultTemplate = "{title} - {name}";
            filenameInput.value = defaultTemplate;
            pendingChanges['filename-template'] = defaultTemplate;
            showApplyBar();
            updateDisableRenameState();

            if (typeof mdui !== 'undefined' && mdui.snackbar) {
                mdui.snackbar({
                    message: browser.i18n.getMessage("settingsTemplateAutoGenerated", [defaultTemplate]),
                    placement: "top"
                });
            }
        };
    }

    const presets = document.querySelectorAll('.color-preset');
    const hexInput = document.getElementById('color-hex-input');
    const openSettingsTabBtn = document.getElementById('open-settings-tab');

    const activeColor = colorResult['theme-color'] || '#bbdefb';
    mdui.setColorScheme(activeColor);
    if (hexInput) hexInput.value = activeColor;

    const updateActivePreset = (color) => {
        presets.forEach(p => {
            if (p.dataset.color && p.dataset.color.toLowerCase() === color.toLowerCase()) {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
    };
    updateActivePreset(activeColor);

    const stageColor = (newColor) => {
        let val = newColor.trim();
        if (!val.startsWith('#') && !val.startsWith('rgb')) val = '#' + val;
        pendingChanges['theme-color'] = val;
        showApplyBar();
        mdui.setColorScheme(val);
        updateActivePreset(val);
    };

    if (hexInput) {
        hexInput.oninput = (e) => {
            let val = e.target.value.trim();
            if (val && !val.startsWith('#') && !val.startsWith('rgb')) val = '#' + val;

            pendingChanges['theme-color'] = val;
            showApplyBar();

            if (/^#[0-9A-F]{3,6}$/i.test(val)) {
                mdui.setColorScheme(val);
                updateActivePreset(val);
            }
        };
    }

    presets.forEach(preset => {
        preset.onclick = () => {
            const color = preset.dataset.color;
            if (color) {
                if (hexInput) hexInput.value = color;
                stageColor(color);
            }
        };
    });

    if (openSettingsTabBtn) {
        openSettingsTabBtn.addEventListener('click', () => {
            browser.tabs.create({ url: 'popup.html?options=true' });
        });
    }

    const bgDlSwitch = document.getElementById('background-download');
    if (bgDlSwitch) {
        syncNotificationSetting(bgDlSwitch.checked);
    }

    setTimeout(() => {
        isInitializing = false;
        pendingChanges = {};
    }, 500);
}

function syncNotificationSetting(isBgEnabled) {
    const notificationSwitch = document.getElementById('media-notification');
    if (!notificationSwitch) return;

    if (!isBgEnabled) {

        notificationSwitch.checked = false;
        notificationSwitch.disabled = true;
        browser.storage.local.set({ 'media-notification': '0' });
    } else {

        notificationSwitch.disabled = false;
    }
}

function applySettingsLayout(layoutType) {
    const container = document.getElementById('settings-container');
    if (!container) return;

    document.querySelectorAll('.settings-items-container').forEach(c => c.style.transition = 'none');

    container.classList.remove('layout-default', 'layout-clean', 'layout-sidebar', 'layout-tabs', 'clean-view-enabled');

    const oldSidebar = container.querySelector('.settings-sidebar-nav');
    if (oldSidebar) oldSidebar.remove();
    const oldTabsHeader = container.querySelector('.settings-tabs-header');
    if (oldTabsHeader) oldTabsHeader.remove();

    const groups = container.querySelectorAll('.settings-group');
    groups.forEach(group => {
        group.style.display = '';
        group.classList.remove('collapsed', 'active-sidebar-group', 'active-tab-group');
    });

    const icons = container.querySelectorAll('.collapse-icon');
    icons.forEach(icon => icon.style.display = 'none');

    if (layoutType === 'default') {
        container.classList.add('layout-default');
    }
    else if (layoutType === 'clean') {
        container.classList.add('layout-clean', 'clean-view-enabled');
        groups.forEach(group => group.classList.add('collapsed'));
        icons.forEach(icon => icon.style.display = 'block');
    }
    else if (layoutType === 'sidebar') {
        container.classList.add('layout-sidebar');

        const sidebarNav = document.createElement('div');
        sidebarNav.className = 'settings-sidebar-nav';

        groups.forEach((group, index) => {
            const titleSpan = group.querySelector('.settings-section-title span[data-translate]');
            const key = titleSpan ? titleSpan.getAttribute('data-translate') : null;
            const titleText = key ? (browser.i18n.getMessage(key) || titleSpan.textContent) : "Group";

            let svgIcon = '';
            const mduiIcon = group.querySelector('.settings-section-title mdui-icon');
            if (mduiIcon) svgIcon = mduiIcon.innerHTML;

            const navItem = document.createElement('div');
            navItem.className = 'sidebar-nav-item' + (index === 0 ? ' active' : '');
            navItem.innerHTML = `<span class="nav-icon">${svgIcon}</span>`;
            navItem.title = titleText;

            navItem.addEventListener('click', () => {
                sidebarNav.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
                navItem.classList.add('active');

                groups.forEach(g => g.classList.remove('active-sidebar-group'));
                group.classList.add('active-sidebar-group');
            });

            sidebarNav.appendChild(navItem);

            if (index === 0) {
                group.classList.add('active-sidebar-group');
            }
        });

        container.insertBefore(sidebarNav, container.firstChild);
    }
    else if (layoutType === 'tabs' || layoutType === 'tabs-icons') {
        container.classList.add('layout-tabs');

        const tabsHeader = document.createElement('div');
        tabsHeader.className = 'settings-tabs-header';
        if (layoutType === 'tabs-icons') {
            tabsHeader.classList.add('tabs-icons-only');
        }

        groups.forEach((group, index) => {
            const titleSpan = group.querySelector('.settings-section-title span[data-translate]');
            const key = titleSpan ? titleSpan.getAttribute('data-translate') : null;
            const titleText = key ? (browser.i18n.getMessage(key) || titleSpan.textContent) : "Group";

            const tabItem = document.createElement('div');
            tabItem.className = 'tabs-nav-item' + (index === 0 ? ' active' : '');

            if (layoutType === 'tabs') {
                tabItem.textContent = titleText;
            } else {
                let svgIcon = '';
                const mduiIcon = group.querySelector('.settings-section-title mdui-icon');
                if (mduiIcon) svgIcon = mduiIcon.innerHTML;
                tabItem.innerHTML = `<span class="nav-icon">${svgIcon}</span>`;
                tabItem.title = titleText;
            }

            tabItem.addEventListener('click', () => {
                tabsHeader.querySelectorAll('.tabs-nav-item').forEach(el => el.classList.remove('active'));
                tabItem.classList.add('active');

                groups.forEach(g => g.classList.remove('active-tab-group'));
                group.classList.add('active-tab-group');
            });

            tabsHeader.appendChild(tabItem);

            if (index === 0) {
                group.classList.add('active-tab-group');
            }
        });

        container.insertBefore(tabsHeader, container.firstChild);
    }

    document.body.offsetHeight;
    setTimeout(() => {
        document.querySelectorAll('.settings-items-container').forEach(c => c.style.transition = '');
    }, 50);

    setTimeout(enforceUIConstraints, 50);
}

function enforceUIConstraints() {
    const optimizeLowEnd = document.getElementById('optimize-low-end');
    if (optimizeLowEnd && optimizeLowEnd.checked) {
        const limitSelect = document.getElementById('limit-media-list');
        const limitCustom = document.getElementById('limit-media-list-custom');
        if (limitSelect) limitSelect.disabled = true;
        if (limitCustom) limitCustom.disabled = true;
    }
    const gdriveStream = document.getElementById('gdrive-stream');
    const dropboxStream = document.getElementById('dropbox-stream');
    const speedBoost = document.getElementById('speed-boost');
    if (((gdriveStream && gdriveStream.checked) || (dropboxStream && dropboxStream.checked)) && speedBoost) {
        speedBoost.disabled = true;
    }
}

function setupCollapsibleLogic() {
    const headers = document.querySelectorAll('.collapsible-header');

    headers.forEach(header => {
        if (header.dataset.collapsibleBound) return;
        header.dataset.collapsibleBound = "true";

        header.addEventListener('click', async () => {
            const layoutResult = await browser.storage.local.get('settings-layout');
            let layoutVal = layoutResult['settings-layout'] || 'tabs-icons';
            if (!layoutResult['settings-layout']) {
                const cleanViewResult = await browser.storage.local.get('clean-view');
                if (cleanViewResult['clean-view'] === '1') {
                    layoutVal = 'clean';
                }
            }
            if (layoutVal !== 'clean') return;

            const currentGroup = header.closest('.settings-group');
            if (!currentGroup) return;

            const isCurrentlyCollapsed = currentGroup.classList.contains('collapsed');

            document.querySelectorAll('.settings-group').forEach(group => {
                group.classList.add('collapsed');
            });

            if (isCurrentlyCollapsed) {
                currentGroup.classList.remove('collapsed');
                setTimeout(enforceUIConstraints, 50);
            }
        });
    });
}

function setupSpeedTest() {
    const startBtn = document.getElementById('start-speed-test');
    if (!startBtn) return;

    const resultsDiv = document.getElementById('speed-test-results');
    const dlValue = document.getElementById('download-speed-value');
    const dlProgress = document.getElementById('download-test-progress');
    const dlBoostValue = document.getElementById('download-boost-speed-value');
    const dlBoostProgress = document.getElementById('download-boost-test-progress');
    const ulValue = document.getElementById('upload-speed-value');
    const ulProgress = document.getElementById('upload-test-progress');
    const ulBoostValue = document.getElementById('upload-boost-speed-value');
    const ulBoostProgress = document.getElementById('upload-boost-test-progress');
    const statusText = document.getElementById('speed-test-status');

    const speedometerContainer = document.getElementById('speedometer-container');
    const speedometerProgress = document.getElementById('speedometer-progress');
    const speedometerValue = document.getElementById('speedometer-value');

    function updateSpeedometer(bps, type) {
        if (!speedometerProgress || !speedometerValue) return;
        const Mbps = bps / 1000000;
        speedometerValue.textContent = Mbps.toFixed(2);

        const maxSpeed = 150;
        const progressFraction = Math.min(Math.sqrt(Mbps / maxSpeed), 1);
        const dashLength = progressFraction * 376.99;
        speedometerProgress.style.strokeDasharray = `${dashLength} 502.65`;

        if (type === 'download') {
            speedometerProgress.style.stroke = 'rgb(var(--mdui-color-primary))';
            speedometerProgress.style.filter = 'drop-shadow(0 0 6px rgba(var(--mdui-color-primary), 0.6))';
        } else {
            speedometerProgress.style.stroke = 'rgb(var(--mdui-color-secondary))';
            speedometerProgress.style.filter = 'drop-shadow(0 0 6px rgba(var(--mdui-color-secondary), 0.6))';
        }
    }

    startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        resultsDiv.style.display = 'flex';
        dlValue.textContent = '-';
        dlBoostValue.textContent = '-';
        ulValue.textContent = '-';
        ulBoostValue.textContent = '-';

        dlProgress.style.display = 'block';
        dlProgress.value = 0;
        dlBoostProgress.style.display = 'none';
        dlBoostProgress.value = 0;
        ulProgress.style.display = 'none';
        ulProgress.value = 0;
        ulBoostProgress.style.display = 'none';
        ulBoostProgress.value = 0;

        if (speedometerContainer) speedometerContainer.style.display = 'flex';
        if (speedometerProgress) speedometerProgress.style.strokeDasharray = '0 502.65';
        if (speedometerValue) speedometerValue.textContent = '0.00';

        const localSettings = await browser.storage.local.get(['connections']);
        const concurrency = parseInt(localSettings['connections'] || '4', 10);

        try {

            statusText.textContent = browser.i18n.getMessage("speedTestStatusTestingDownload") || "Testing download speed...";
            const downloadBps = await runDownloadTest((progress, currentBps) => {
                dlProgress.value = progress;
                dlValue.textContent = formatSpeed(currentBps);
                updateSpeedometer(currentBps, 'download');
            });
            dlValue.textContent = formatSpeed(downloadBps);
            updateSpeedometer(downloadBps, 'download');
            dlProgress.style.display = 'none';

            dlBoostProgress.style.display = 'block';
            statusText.textContent = `Testing download speed boost (using ${concurrency} connections)...`;
            const downloadBoostBps = await runParallelDownloadTest(concurrency, (progress, currentBps) => {
                dlBoostProgress.value = progress;
                dlBoostValue.textContent = formatSpeed(currentBps);
                updateSpeedometer(currentBps, 'download');
            });
            dlBoostValue.textContent = formatSpeed(downloadBoostBps);
            updateSpeedometer(downloadBoostBps, 'download');
            dlBoostProgress.style.display = 'none';

            ulProgress.style.display = 'block';
            statusText.textContent = browser.i18n.getMessage("speedTestStatusTestingUpload") || "Testing upload speed...";
            const uploadBps = await runUploadTest((progress, currentBps) => {
                ulProgress.value = progress;
                ulValue.textContent = formatSpeed(currentBps);
                updateSpeedometer(currentBps, 'upload');
            });
            ulValue.textContent = formatSpeed(uploadBps);
            updateSpeedometer(uploadBps, 'upload');
            ulProgress.style.display = 'none';

            ulBoostProgress.style.display = 'block';
            statusText.textContent = `Testing upload speed boost (using ${concurrency} connections)...`;
            const uploadBoostBps = await runParallelUploadTest(concurrency, (progress, currentBps) => {
                ulBoostProgress.value = progress;
                ulBoostValue.textContent = formatSpeed(currentBps);
                updateSpeedometer(currentBps, 'upload');
            });
            ulBoostValue.textContent = formatSpeed(uploadBoostBps);
            updateSpeedometer(uploadBoostBps, 'upload');
            ulBoostProgress.style.display = 'none';

            statusText.textContent = browser.i18n.getMessage("speedTestStatusCompleted") || "Test completed!";
        } catch (error) {
            console.error("Speed Test Error:", error);
            if (error.message && error.message.includes("429")) {
                statusText.textContent = "Rate limit aktif (HTTP 429). Harap tunggu 1-2 menit sebelum mencoba lagi.";
            } else {
                statusText.textContent = (browser.i18n.getMessage("speedTestStatusFailed") || "Test failed.") + " (" + error.message + ")";
            }
            dlProgress.style.display = 'none';
            dlBoostProgress.style.display = 'none';
            ulProgress.style.display = 'none';
            ulBoostProgress.style.display = 'none';
        } finally {
            startBtn.disabled = false;
        }
    });

    setupCollapsibleLogic();
}

function formatSpeed(bps) {
    if (!bps || bps <= 0) return "-";
    const Mbps = bps / 1000000;
    if (Mbps >= 1) {
        return Mbps.toFixed(2) + " Mbps";
    }
    const Kbps = bps / 1000;
    return Kbps.toFixed(2) + " Kbps";
}

async function runDownloadTest(onProgress) {
    const startTime = performance.now();
    const durationMs = 10000;
    let totalReceived = 0;

    while (performance.now() - startTime < durationMs) {
        const controller = new AbortController();
        let response;
        try {
            response = await fetch('https://speed.cloudflare.com/__down?bytes=50000000', { signal: controller.signal });
        } catch (e) {
            if (totalReceived > 0) break;
            throw new Error("Failed to download test file: " + e.message);
        }
        if (!response.ok) {
            if (totalReceived > 0) break;
            throw new Error("Failed to download test file: HTTP status " + response.status);
        }

        const reader = response.body.getReader();
        try {
            while (true) {
                const elapsed = performance.now() - startTime;
                if (elapsed >= durationMs) {
                    controller.abort();
                    break;
                }
                const { done, value } = await reader.read();
                if (done) break;
                totalReceived += value.length;
                if (elapsed > 0) {
                    const bps = (totalReceived * 8) / (elapsed / 1000);
                    const progress = Math.min((elapsed / durationMs) * 100, 100);
                    onProgress(progress, bps);
                }
            }
        } catch (e) {
            if (!(e.name === 'AbortError' || (e.message && e.message.includes('aborted')))) {
                if (totalReceived > 0) break;
                throw e;
            }
        }
    }

    const finalElapsed = (performance.now() - startTime) / 1000;
    return (totalReceived * 8) / finalElapsed;
}

async function runParallelDownloadTest(concurrency, onProgress) {
    const startTime = performance.now();
    const durationMs = 10000;
    let totalReceived = 0;
    let hasError = false;

    const downloadJobs = Array.from({ length: concurrency }).map(async () => {
        while (performance.now() - startTime < durationMs && !hasError) {
            const controller = new AbortController();
            let response;
            try {
                response = await fetch('https://speed.cloudflare.com/__down?bytes=50000000', { signal: controller.signal });
            } catch (e) {
                if (e.name === 'AbortError' || (e.message && e.message.includes('aborted'))) {
                    break;
                }
                hasError = true;
                throw new Error("Parallel download failed: " + e.message);
            }
            if (!response.ok) {
                hasError = true;
                throw new Error("Parallel download response error");
            }

            const reader = response.body.getReader();
            try {
                while (true) {
                    const elapsed = performance.now() - startTime;
                    if (elapsed >= durationMs || hasError) {
                        controller.abort();
                        break;
                    }
                    const { done, value } = await reader.read();
                    if (done) break;
                    totalReceived += value.length;

                    if (elapsed > 0) {
                        const bps = (totalReceived * 8) / (elapsed / 1000);
                        const progress = Math.min((elapsed / durationMs) * 100, 100);
                        onProgress(progress, bps);
                    }
                }
            } catch (e) {
                if (!(e.name === 'AbortError' || (e.message && e.message.includes('aborted')))) {
                    hasError = true;
                    throw e;
                }
            }
        }
    });

    await Promise.all(downloadJobs);

    const finalElapsed = (performance.now() - startTime) / 1000;
    return (totalReceived * 8) / finalElapsed;
}

async function runUploadTest(onProgress) {
    const startTime = performance.now();
    const durationMs = 10000;
    let totalUploaded = 0;

    const chunk = new Uint8Array(2 * 1024 * 1024);

    while (performance.now() - startTime < durationMs) {
        await new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "https://speed.cloudflare.com/__up");

            let lastLoaded = 0;
            xhr.upload.onprogress = (event) => {
                const chunkUploaded = event.loaded - lastLoaded;
                lastLoaded = event.loaded;
                totalUploaded += chunkUploaded;

                const elapsed = performance.now() - startTime;
                if (elapsed >= durationMs) {
                    xhr.abort();
                    return;
                }

                if (elapsed > 0) {
                    const bps = (totalUploaded * 8) / (elapsed / 1000);
                    const progress = Math.min((elapsed / durationMs) * 100, 100);
                    onProgress(progress, bps);
                }
            };

            xhr.onload = () => resolve();
            xhr.onerror = () => resolve();
            xhr.onabort = () => resolve();

            xhr.send(chunk);
        });
    }

    const finalElapsed = (performance.now() - startTime) / 1000;
    return (totalUploaded * 8) / finalElapsed;
}

async function runParallelUploadTest(concurrency, onProgress) {
    const startTime = performance.now();
    const durationMs = 10000;
    let totalUploaded = 0;
    let hasError = false;
    const chunk = new Uint8Array(1 * 1024 * 1024);

    const uploadJobs = Array.from({ length: concurrency }).map(async () => {
        while (performance.now() - startTime < durationMs && !hasError) {
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", "https://speed.cloudflare.com/__up");

                let lastLoaded = 0;
                xhr.upload.onprogress = (event) => {
                    const elapsed = performance.now() - startTime;
                    if (elapsed >= durationMs || hasError) {
                        xhr.abort();
                        resolve();
                        return;
                    }
                    const chunkUploaded = event.loaded - lastLoaded;
                    lastLoaded = event.loaded;
                    totalUploaded += chunkUploaded;

                    if (elapsed > 0) {
                        const bps = (totalUploaded * 8) / (elapsed / 1000);
                        const progress = Math.min((elapsed / durationMs) * 100, 100);
                        onProgress(progress, bps);
                    }
                };

                xhr.onload = () => resolve();
                xhr.onerror = () => {
                    hasError = true;
                    reject(new Error("Parallel upload failed"));
                };
                xhr.onabort = () => resolve();

                xhr.send(chunk);
            });
        }
    });

    await Promise.all(uploadJobs);

    const finalElapsed = (performance.now() - startTime) / 1000;
    return (totalUploaded * 8) / finalElapsed;
}
