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

const urlParams = new URLSearchParams(window.location.search);
const downloadId = urlParams.get('id');
const targetUrl = urlParams.get('url');
const cacheKey = downloadId || targetUrl;
const filename = urlParams.get('filename') || browser.i18n.getMessage("defaultMediaName");

const DB_NAME = "MediaCacheDB";
const STORE_NAME = "network-cache";
const CHUNK_STORE_NAME = "download-chunks";

function openCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 3);
        request.onerror = (event) => reject(event.target.error || browser.i18n.getMessage("idbOpenError") || "IDB Open Error");
        request.onblocked = () => {
            console.warn("IndexedDB blocked. Please close other tabs of this extension.");
            const title = document.getElementById('status-title');
            if (title) title.textContent = browser.i18n.getMessage("downloadWaiting");
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "url" });
            }
            if (!db.objectStoreNames.contains(CHUNK_STORE_NAME)) {
                db.createObjectStore(CHUNK_STORE_NAME, { keyPath: ["downloadId", "chunkIndex"] });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
    });
}

class CloudUploadController {
    constructor() {
        this.paused = false;
        this.cancelled = false;
        this.onResume = null;
        this.xhr = null;
    }

    pause() {
        this.paused = true;
        if (this.xhr) {
            this.xhr.abort();
        }
    }

    resume() {
        this.paused = false;
        if (this.onResume) {
            this.onResume();
        }
    }

    cancel() {
        this.cancelled = true;
        if (this.xhr) {
            this.xhr.abort();
        }
    }
}

async function reauthGDrive() {
    return new Promise((resolve, reject) => {
        try {
            const clientId = "1042907477337-c8h27qniercjia05jqqafgvjao514n28.apps.googleusercontent.com";
            
            let finalRedirectUri;
            if (typeof browser !== 'undefined' && browser.identity && typeof browser.identity.getRedirectURL === 'function') {
                finalRedirectUri = browser.identity.getRedirectURL();
            } else {
                const id = browser.runtime.id;
                if (id && id.includes('@')) {
                    finalRedirectUri = `https://${encodeURIComponent(id)}.extensions.allizom.org/`;
                } else {
                    finalRedirectUri = "https://924f7c81-8b1e-4b6e-9e7c-8e4a9e1d2c3f.extensions.allizom.org/";
                }
            }

            const scope = encodeURIComponent("https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email");
            const normalizedRedirectUri = finalRedirectUri.endsWith('/') ? finalRedirectUri.slice(0, -1) : finalRedirectUri;
            
            const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(finalRedirectUri)}&scope=${scope}&prompt=none`;
            
            if (typeof browser !== 'undefined' && browser.identity && typeof browser.identity.launchWebAuthFlow === 'function') {
                browser.identity.launchWebAuthFlow({
                    url: authUrl,
                    interactive: false
                }).then(async (redirectUrl) => {
                    if (redirectUrl) {
                        const url = new URL(redirectUrl);
                        const hashParams = new URLSearchParams(url.hash.substring(1));
                        const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
                        if (accessToken) {
                            await browser.storage.local.set({ 'gdrive_token': accessToken });
                            resolve(accessToken);
                        } else {
                            reject(new Error("No access token in redirect URL"));
                        }
                    } else {
                        reject(new Error("No redirect URL"));
                    }
                }).catch(e => {
                    reject(e);
                });
            } else {
                let isResolved = false;
                let authTabId = null;

                const updatedListener = async (tabId, changeInfo, tab) => {
                    const urlString = changeInfo.url || tab.url;
                    if (urlString && urlString.includes(normalizedRedirectUri) && (urlString.includes('access_token=') || urlString.includes('error='))) {
                        if (!isResolved) {
                            isResolved = true;
                            browser.tabs.remove(tabId).catch(() => {});
                            cleanup();
                            
                            const url = new URL(urlString);
                            const hashParams = new URLSearchParams(url.hash.substring(1));
                            const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
                            
                            if (accessToken) {
                                await browser.storage.local.set({ 'gdrive_token': accessToken });
                                resolve(accessToken);
                            } else {
                                reject(new Error("Failed to reauth: " + (hashParams.get('error') || "No access token")));
                            }
                        }
                    }
                };

                const removedListener = (tabId) => {
                    if (authTabId && tabId === authTabId && !isResolved) {
                        isResolved = true;
                        cleanup();
                        reject(new Error("Reauth tab closed"));
                    }
                };

                const cleanup = () => {
                    browser.tabs.onUpdated.removeListener(updatedListener);
                    browser.tabs.onRemoved.removeListener(removedListener);
                };

                browser.tabs.onUpdated.addListener(updatedListener);
                browser.tabs.onRemoved.addListener(removedListener);

                browser.tabs.create({ url: authUrl, active: false }).then(tab => {
                    authTabId = tab.id;
                }).catch(e => {
                    if (!isResolved) {
                        isResolved = true;
                        cleanup();
                        reject(e);
                    }
                });
            }
        } catch (e) {
            reject(e);
        }
    });
}


async function reauthDropbox() {
    return new Promise((resolve, reject) => {
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
            
            const normalizedRedirectUri = finalRedirectUri.endsWith('/') ? finalRedirectUri.slice(0, -1) : finalRedirectUri;
            const authUrl = "https://www.dropbox.com/oauth2/authorize?client_id=" + clientId + "&response_type=token&redirect_uri=" + encodeURIComponent(finalRedirectUri);

            if (typeof browser !== 'undefined' && browser.identity && typeof browser.identity.launchWebAuthFlow === 'function') {
                browser.identity.launchWebAuthFlow({
                    url: authUrl,
                    interactive: false
                }).then(redirectUrl => {
                    if (redirectUrl) {
                        const url = new URL(redirectUrl);
                        const hashParams = new URLSearchParams(url.hash.substring(1));
                        const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
                        if (accessToken) {
                            browser.storage.local.set({ 'dropbox_token': accessToken }).then(() => resolve(accessToken));
                        } else {
                            reject(new Error("No access token found in redirect URL"));
                        }
                    } else {
                        reject(new Error("No redirect URL returned"));
                    }
                }).catch(e => reject(e));
            } else {
                let isResolved = false;
                let authTabId = null;

                const updatedListener = async (tabId, changeInfo, tab) => {
                    const urlString = changeInfo.url || tab.url;
                    if (urlString && urlString.includes(normalizedRedirectUri) && (urlString.includes('access_token=') || urlString.includes('error='))) {
                        if (!isResolved) {
                            isResolved = true;
                            browser.tabs.remove(tabId).catch(() => {});
                            cleanup();
                            
                            const url = new URL(urlString);
                            const hashParams = new URLSearchParams(url.hash.substring(1));
                            const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
                            
                            if (accessToken) {
                                browser.storage.local.set({ 'dropbox_token': accessToken }).then(() => resolve(accessToken));
                            } else {
                                reject(new Error("Failed to reauth Dropbox"));
                            }
                        }
                    }
                };

                const removedListener = (tabId) => {
                    if (authTabId && tabId === authTabId && !isResolved) {
                        isResolved = true;
                        cleanup();
                        reject(new Error("Reauth tab closed"));
                    }
                };

                const cleanup = () => {
                    browser.tabs.onUpdated.removeListener(updatedListener);
                    browser.tabs.onRemoved.removeListener(removedListener);
                };

                browser.tabs.onUpdated.addListener(updatedListener);
                browser.tabs.onRemoved.addListener(removedListener);

                browser.tabs.create({ url: authUrl, active: false }).then(tab => {
                    authTabId = tab.id;
                }).catch(e => {
                    if (!isResolved) {
                        isResolved = true;
                        cleanup();
                        reject(e);
                    }
                });
            }
        } catch (e) {
            reject(e);
        }
    });
}

function uploadToDropbox(blob, filename, onProgress, controller, isRetry = false) {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await browser.storage.local.get('dropbox_token');
            if (!res.dropbox_token) {
                return reject(new Error("Dropbox token not found. Please login in settings."));
            }
            const token = res.dropbox_token;

            const uploadUrl = 'https://content.dropboxapi.com/2/files/upload';
            const apiArgRaw = JSON.stringify({
                path: "/" + filename.replace(/[/\\?%*:|"<>]/g, '-'),
                mode: "add",
                autorename: true,
                mute: false
            });
            const apiArg = apiArgRaw.replace(/[\u007f-\uffff]/g, function(c) { 
                return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);
            });

            const xhr = new XMLHttpRequest();
            if (controller) controller.xhr = xhr;
            xhr.open('POST', uploadUrl);
            xhr.setRequestHeader('Authorization', "Bearer " + token);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.setRequestHeader('Dropbox-API-Arg', apiArg);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable && onProgress) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    onProgress(percent);
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200 || xhr.status === 201) {
                    resolve();
                } else if (xhr.status === 401 && !isRetry) {
                    reauthDropbox().then(() => {
                        uploadToDropbox(blob, filename, onProgress, controller, true).then(resolve).catch(reject);
                    }).catch(() => {
                        reject(new Error("Dropbox session expired. Please re-login in settings."));
                    });
                } else {
                    reject(new Error("Dropbox Upload Error: " + xhr.statusText));
                }
            };

            xhr.onabort = () => {
                if (controller && controller.paused) {
                    controller.onResume = () => {
                        controller.onResume = null;
                        uploadToDropbox(blob, filename, onProgress, controller).then(resolve).catch(reject);
                    };
                }
            };

            xhr.onerror = () => {
                if (controller && controller.cancelled) {
                    reject(new Error("Upload cancelled"));
                } else if (controller && controller.paused) {
                    controller.onResume = () => {
                        controller.onResume = null;
                        uploadToDropbox(blob, filename, onProgress, controller).then(resolve).catch(reject);
                    };
                } else {
                    reject(new Error("Network error during Dropbox upload"));
                }
            };

            xhr.send(blob);

        } catch (error) {
            reject(error);
        }
    });
}

function uploadToGDrive(blob, filename, onProgress, controller, isRetry = false) {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await browser.storage.local.get('gdrive_token');
            if (!res.gdrive_token) {
                return reject(new Error(browser.i18n.getMessage("gdriveLoginRequired") || "Google Drive token not found. Please login in settings."));
            }
            const token = res.gdrive_token;

            const metadata = {
                name: filename,
                mimeType: blob.type || 'application/octet-stream'
            };

            const initXhr = new XMLHttpRequest();
            if (controller) controller.xhr = initXhr;
            initXhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable');
            initXhr.setRequestHeader('Authorization', `Bearer ${token}`);
            initXhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
            initXhr.setRequestHeader('X-Upload-Content-Type', blob.type || 'application/octet-stream');
            initXhr.setRequestHeader('X-Upload-Content-Length', blob.size);

            initXhr.onload = () => {
                if (initXhr.status === 200 || initXhr.status === 201) {
                    const sessionUri = initXhr.getResponseHeader('Location');
                    if (sessionUri) {
                        uploadChunks(sessionUri, blob, onProgress, controller).then(resolve).catch(reject);
                    } else {
                        reject(new Error("Failed to get session URI for resumable upload"));
                    }
                } else if (initXhr.status === 401) {
                    if (!isRetry) {
                        reauthGDrive().then(() => {
                            uploadToGDrive(blob, filename, onProgress, controller, true).then(resolve).catch(reject);
                        }).catch(() => {
                            reject(new Error(browser.i18n.getMessage("gdriveSessionExpired") || "Google Drive session expired. Please re-login in settings."));
                        });
                    } else {
                        reject(new Error(browser.i18n.getMessage("gdriveSessionExpired") || "Google Drive session expired. Please re-login in settings."));
                    }
                } else {
                    reject(new Error("GDrive Init Error: " + initXhr.statusText));
                }
            };

            initXhr.onabort = () => {
                if (controller && controller.paused) {
                    controller.onResume = () => {
                        controller.onResume = null;
                        uploadToGDrive(blob, filename, onProgress, controller).then(resolve).catch(reject);
                    };
                }
            };

            initXhr.onerror = () => {
                if (controller && controller.cancelled) {
                    reject(new Error("Upload cancelled"));
                } else if (controller && controller.paused) {
                    controller.onResume = () => {
                        controller.onResume = null;
                        uploadToGDrive(blob, filename, onProgress, controller).then(resolve).catch(reject);
                    };
                } else {
                    reject(new Error("Network error during GDrive init"));
                }
            };
            initXhr.send(JSON.stringify(metadata));

        } catch (error) {
            reject(error);
        }
    });
}

function uploadChunks(sessionUri, blob, onProgress, controller) {
    return new Promise((resolve, reject) => {
        const chunkSize = 1024 * 1024; // 1MB chunks
        let offset = 0;

        const uploadNextChunk = (retries = 3) => {
            if (controller && controller.cancelled) {
                reject(new Error("Upload cancelled"));
                return;
            }

            if (controller && controller.paused) {
                controller.onResume = () => {
                    controller.onResume = null;
                    uploadNextChunk();
                };
                return;
            }

            const end = Math.min(offset + chunkSize, blob.size);
            const chunk = blob.slice(offset, end);
            const contentRange = `bytes ${offset}-${end - 1}/${blob.size}`;

            const xhr = new XMLHttpRequest();
            if (controller) controller.xhr = xhr;
            xhr.open('PUT', sessionUri);
            xhr.setRequestHeader('Content-Range', contentRange);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) {
                    const totalUploaded = offset + e.loaded;
                    const percent = Math.round((totalUploaded / blob.size) * 100);
                    onProgress(percent, totalUploaded, blob.size);
                }
            };

            xhr.onload = () => {
                if (xhr.status === 308) {
                    offset = end;
                    uploadNextChunk();
                } else if (xhr.status === 200 || xhr.status === 201) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        resolve(xhr.responseText);
                    }
                } else if (xhr.status >= 500 && xhr.status < 600) {
                    if (retries > 0) {
                        console.warn(`GDrive Chunk Error: ${xhr.status}, retrying... (${retries} left)`);
                        setTimeout(() => uploadNextChunk(retries - 1), 2000);
                    } else {
                        reject(new Error("GDrive Chunk Error: " + xhr.status + " " + xhr.statusText));
                    }
                } else {
                    reject(new Error("GDrive Chunk Error: " + xhr.status + " " + xhr.statusText));
                }
            };

            xhr.onabort = () => {
                if (controller && controller.paused) {
                    controller.onResume = () => {
                        controller.onResume = null;
                        uploadNextChunk();
                    };
                }
            };

            xhr.onerror = () => {
                if (controller && controller.cancelled) {
                    reject(new Error("Upload cancelled"));
                } else if (controller && controller.paused) {
                    // If we paused during an active chunk, set the resume hook to retry this chunk
                    controller.onResume = () => {
                        controller.onResume = null;
                        uploadNextChunk();
                    };
                } else {
                    if (retries > 0) {
                        console.warn(`Network error during GDrive chunk upload, retrying... (${retries} left)`);
                        setTimeout(() => uploadNextChunk(retries - 1), 2000);
                    } else {
                        reject(new Error("Network error during GDrive chunk upload"));
                    }
                }
            };
            xhr.send(chunk);
        };

        uploadNextChunk();
    });
}

async function triggerDownload() {
    const statusTitle = document.getElementById('status-title');
    const statusText = document.getElementById('status-text');
    const saveButton = document.getElementById('save-button');

    try {
        statusText.textContent = browser.i18n.getMessage("downloadConnectingDB");
        const db = await openCacheDB();

        statusText.textContent = browser.i18n.getMessage("downloadFetchingMetadata");
        const tx = db.transaction([STORE_NAME], "readonly");
        const store = tx.objectStore(STORE_NAME);
        const getRequest = store.get(cacheKey);

        getRequest.onsuccess = async (event) => {
            try {
                const item = event.target.result;
                if (item) {
                    let blob;
                    if (item.data) {

                        blob = item.data;
                    } else {

                        statusTitle.textContent = browser.i18n.getMessage("downloadProcessing");
                        statusText.textContent = browser.i18n.getMessage("downloadReconstructing");

                        const chunks = [];
                        const chunkTx = db.transaction([CHUNK_STORE_NAME], "readonly");
                        const chunkStore = chunkTx.objectStore(CHUNK_STORE_NAME);

                        const range = IDBKeyRange.bound([cacheKey, 0], [cacheKey, Infinity]);
                        const cursorRequest = chunkStore.openCursor(range);

                        let lastUpdate = Date.now();
                        await new Promise((resolveChunk, rejectChunk) => {
                            cursorRequest.onsuccess = (e) => {
                                const cursor = e.target.result;
                                if (cursor) {
                                    chunks.push({ 
                                        index: cursor.value.chunkIndex, 
                                        data: cursor.value.data 
                                    });

                                    const now = Date.now();
                                    if (now - lastUpdate > 500) {
                                        statusText.textContent = browser.i18n.getMessage("downloadReconstructingSegments", [chunks.length.toString()]);
                                        lastUpdate = now;
                                    }

                                    cursor.continue();
                                } else {
                                    resolveChunk();
                                }
                            };
                            cursorRequest.onerror = (e) => rejectChunk(e.target.error);
                        });

                        if (chunks.length === 0) {
                            throw new Error(browser.i18n.getMessage("downloadMetadataNotFound"));
                        }

                        chunks.sort((a, b) => a.index - b.index);

                        statusText.textContent = browser.i18n.getMessage("downloadAssembling", [chunks.length.toString()]);
                        const blobData = chunks.map(c => c.data);
                        blob = new Blob(blobData, { type: item.mime || "application/octet-stream" });
                    }

                    const objectUrl = URL.createObjectURL(blob);

                    
                    const settings = await browser.storage.local.get(['save-to-gdrive', 'save-to-dropbox']);
                    if (settings['save-to-dropbox'] === '1') {
                        const controller = new CloudUploadController();
                        const cloudControls = document.getElementById('cloud-upload-controls');
                        const pauseBtn = document.getElementById('pause-upload-button');
                        const resumeBtn = document.getElementById('resume-upload-button');
                        const cancelBtn = document.getElementById('cancel-upload-button');

                        if (cloudControls) cloudControls.style.display = 'flex';

                        pauseBtn.onclick = () => {
                            controller.pause();
                            pauseBtn.style.display = 'none';
                            resumeBtn.style.display = 'inline-block';
                            statusTitle.textContent = browser.i18n.getMessage("uploadPausedTitle") || "Upload Paused";
                        };

                        resumeBtn.onclick = () => {
                            controller.resume();
                            resumeBtn.style.display = 'none';
                            pauseBtn.style.display = 'inline-block';
                            statusTitle.textContent = browser.i18n.getMessage("uploadResumedTitle") || "Upload Resumed";
                        };

                        cancelBtn.onclick = () => {
                            controller.cancel();
                        };

                        try {
                            statusTitle.textContent = browser.i18n.getMessage("uploadingToCloudTitle") || "Uploading to Cloud";
                            statusText.textContent = "Uploading to Dropbox... (0%)";
                            
                            await uploadToDropbox(blob, filename, (percent) => {
                                statusText.textContent = "Uploading to Dropbox... (" + percent + "%)";
                            }, controller);

                            if (cloudControls) cloudControls.style.display = 'none';
                            statusTitle.textContent = "Upload Complete!";
                            statusText.textContent = "Successfully saved " + filename + " to Dropbox!";

                            browser.runtime.sendMessage({ action: 'downloadComplete', id: cacheKey, url: targetUrl, cloud: true }).catch(() => {});

                            setTimeout(() => {
                                window.close();
                            }, 2000);
                            return;
                        } catch (error) {
                            if (cloudControls) cloudControls.style.display = 'none';
                            if (error.message === "Upload cancelled") {
                                statusTitle.textContent = browser.i18n.getMessage("uploadCancelledTitle") || "Upload Cancelled";
                                statusText.textContent = browser.i18n.getMessage("uploadCancelledText") || "Cloud upload was cancelled.";
                            } else {
                                console.error("Dropbox auto-upload failed:", error);
                                statusTitle.textContent = "Dropbox Upload Failed";
                                statusText.textContent = error.message;
                                
                                const openSettingsBtn = document.createElement('mdui-button');
                                openSettingsBtn.textContent = browser.i18n.getMessage("openSettingsButton") || "Open Settings";
                                openSettingsBtn.onclick = () => { browser.tabs.create({ url: 'popup.html?options=true' }); };
                                document.querySelector('.action-area').appendChild(openSettingsBtn);
                            }
                            return;
                        }
                    } else if (settings['save-to-gdrive'] === '1') {
                        const controller = new CloudUploadController();
                        const cloudControls = document.getElementById('cloud-upload-controls');
                        const pauseBtn = document.getElementById('pause-upload-button');
                        const resumeBtn = document.getElementById('resume-upload-button');
                        const cancelBtn = document.getElementById('cancel-upload-button');

                        if (cloudControls) cloudControls.style.display = 'flex';

                        pauseBtn.onclick = () => {
                            controller.pause();
                            pauseBtn.style.display = 'none';
                            resumeBtn.style.display = 'inline-block';
                            statusTitle.textContent = browser.i18n.getMessage("uploadPausedTitle") || "Upload Paused";
                        };

                        resumeBtn.onclick = () => {
                            controller.resume();
                            resumeBtn.style.display = 'none';
                            pauseBtn.style.display = 'inline-block';
                            statusTitle.textContent = browser.i18n.getMessage("uploadingToGDriveShort") || "Uploading to Cloud...";
                        };

                        cancelBtn.onclick = () => {
                            controller.cancel();
                            if (cloudControls) cloudControls.style.display = 'none';
                        };

                        try {
                            statusTitle.textContent = browser.i18n.getMessage("uploadingToGDriveShort") || "Uploading to Cloud...";
                            statusText.textContent = browser.i18n.getMessage("uploadingToGDrive", [filename]) || `Uploading ${filename} to Google Drive...`;
                            
                            await uploadToGDrive(blob, filename, (percent) => {
                                statusText.textContent = (browser.i18n.getMessage("uploadingToGDriveShort") || "Uploading to Cloud...") + ` (${percent}%)`;
                            }, controller);
                            
                            if (cloudControls) cloudControls.style.display = 'none';
                            statusTitle.textContent = browser.i18n.getMessage("uploadSuccessGDriveTitle") || "Upload Complete!";
                            statusText.textContent = browser.i18n.getMessage("uploadSuccessGDrive", [filename]) || `Successfully saved ${filename} to Google Drive!`;
                            
                            browser.runtime.sendMessage({ action: 'downloadComplete', id: cacheKey, url: targetUrl, cloud: true }).catch(() => {});
                            
                            setTimeout(() => {
                                window.close();
                            }, 2000);
                            return;
                        } catch (error) {
                            if (cloudControls) cloudControls.style.display = 'none';
                            if (error.message === "Upload cancelled") {
                                statusTitle.textContent = browser.i18n.getMessage("uploadCancelledTitle") || "Upload Cancelled";
                                statusText.textContent = browser.i18n.getMessage("uploadCancelledText") || "Cloud upload was cancelled.";
                            } else {
                                console.error("GDrive auto-upload failed:", error);
                            }
                        }
                    }

                    statusTitle.textContent = browser.i18n.getMessage("downloadReadyTitle");
                    saveButton.style.display = "inline-block";
                    saveButton.textContent = browser.i18n.getMessage("saveFileLabel", [filename]);
                    statusText.textContent = browser.i18n.getMessage("downloadReadyText");

                    const closeButton = document.getElementById('close-button');
                    closeButton.onclick = () => window.close();

                    const performDownload = () => {
                        const a = document.createElement("a");
                        a.href = objectUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);

                        statusTitle.textContent = browser.i18n.getMessage("downloadStartedTitle");
                        statusText.textContent = browser.i18n.getMessage("downloadStartedText");
                        saveButton.disabled = true;
                        saveButton.style.opacity = "0.5";

                        browser.runtime.sendMessage({ action: 'downloadComplete', id: cacheKey, url: targetUrl }).catch(() => {});
                        
                        // We no longer automatically close or cleanup here.
                        // Cleanup happens when the user manually closes the tab.
                        const closeButton = document.getElementById('close-button');
                        if (closeButton) {
                            closeButton.onclick = () => window.close();
                        }
                    };

                    saveButton.onclick = performDownload;
                    performDownload();
                } else {
                    statusTitle.textContent = browser.i18n.getMessage("downloadErrorTitle");
                    statusText.textContent = browser.i18n.getMessage("downloadMetadataNotFound");
                    setTimeout(() => window.close(), 5000);
                }
            } catch (innerError) {
                statusTitle.textContent = browser.i18n.getMessage("downloadProcessingError");
                statusText.textContent = innerError.message;
            }
        };

        getRequest.onerror = (e) => {
            statusTitle.textContent = browser.i18n.getMessage("downloadDatabaseError");
            statusText.textContent = browser.i18n.getMessage("downloadDatabaseErrorText");
        };

    } catch (error) {
        statusTitle.textContent = browser.i18n.getMessage("downloadUnexpectedError");
        statusText.textContent = error.message;
        setTimeout(() => window.close(), 5000);
    }
}

document.addEventListener('DOMContentLoaded', async () => {

    const colorResult = await browser.storage.local.get('theme-color');
    if (typeof mdui !== 'undefined') {
        mdui.setColorScheme(colorResult['theme-color'] || '#bbdefb');
    }

    if (targetUrl) {
        browser.runtime.sendMessage({ action: 'registerDownloadTab', id: cacheKey }).catch(() => {});
        triggerDownload();
    } else {
        window.close();
    }
});
