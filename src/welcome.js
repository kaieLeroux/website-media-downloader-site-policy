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

(function () {
  const STORAGE_KEY = 'wmd_welcome_shown';
  const LEARN_URL   = 'https://wmd.devianproject.tech/features?learn=all';

  const _browser = (typeof browser !== 'undefined') ? browser : chrome;

  function showWelcomePopup() {
    const overlay = document.getElementById('welcome-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
  }

  function dismissWelcomePopup() {
    const overlay = document.getElementById('welcome-overlay');
    const card    = document.getElementById('welcome-card');
    if (!overlay) return;

    card.style.animation = 'wCardZoomOut 0.25s cubic-bezier(0.36,0.07,0.19,0.97) forwards';
    setTimeout(() => {
      overlay.style.display = 'none';
      card.style.animation  = '';
    }, 300);

    try {
      const result = _browser.storage.local.set({ [STORAGE_KEY]: '1' });
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch (e) {}
  }

  document.getElementById('welcome-learn-btn').addEventListener('click', () => {
    dismissWelcomePopup();
    _browser.tabs.create({ url: LEARN_URL });
  });

  document.getElementById('welcome-dismiss-btn').addEventListener('click', () => {
    dismissWelcomePopup();
  });

  document.getElementById('welcome-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('welcome-overlay')) {
      dismissWelcomePopup();
    }
  });

  function checkAndShow() {
    try {
      const result = _browser.storage.local.get(STORAGE_KEY);
      if (result && typeof result.then === 'function') {
        result.then((data) => {
          if (!data[STORAGE_KEY]) {
            setTimeout(showWelcomePopup, 500);
          }
        }).catch(() => {
          setTimeout(showWelcomePopup, 500);
        });
      } else {
        _browser.storage.local.get(STORAGE_KEY, (data) => {
          if (!data[STORAGE_KEY]) {
            setTimeout(showWelcomePopup, 500);
          }
        });
      }
    } catch (e) {
      setTimeout(showWelcomePopup, 500);
    }
  }

  checkAndShow();
})();
