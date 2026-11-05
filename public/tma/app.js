document.addEventListener('DOMContentLoaded', () => {
    // --- Telegram WebApp SDK Initialization ---
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
        try { tg.enableClosingConfirmation(); } catch (e) {}
    }

    function triggerHaptic(type = 'light') {
        try {
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred(type);
            }
        } catch (e) {}
    }

    // Set user greeting from Telegram profile if available
    const userGreeting = document.getElementById('user-greeting');
    if (tg?.initDataUnsafe?.user?.first_name) {
        userGreeting.textContent = `Hey, ${tg.initDataUnsafe.user.first_name} 👋`;
    }

    // --- DOM Elements: Navigation & Views ---
    const viewHome = document.getElementById('view-home');
    const viewViral = document.getElementById('view-viral');
    const headerViralBtn = document.getElementById('header-viral-btn');
    const headerRefreshBtn = document.getElementById('header-refresh-btn');
    const browseViralBtn = document.getElementById('browse-viral-btn');
    const backToHomeBtn = document.getElementById('back-to-home-btn');
    const bottomNavItems = document.querySelectorAll('.bottom-nav .nav-item');

    // --- DOM Elements: Home View ---
    const linkInput = document.getElementById('link-input');
    const pasteActionBtn = document.getElementById('paste-action-btn');
    const playDownloadBtn = document.getElementById('play-download-btn');
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const homeResolvingLoader = document.getElementById('home-resolving-loader');
    const homePlayerSection = document.getElementById('home-player-section');
    const homeVideoTitle = document.getElementById('home-video-title');
    const homeVideoSize = document.getElementById('home-video-size');
    const homeVideoDuration = document.getElementById('home-video-duration');
    const homeVideoQuality = document.getElementById('home-video-quality');
    const homeFastDownloadBtn = document.getElementById('home-fast-download-btn');
    const homeStdDownloadBtn = document.getElementById('home-std-download-btn');
    const homeCopyLinkBtn = document.getElementById('home-copy-link-btn');

    // --- DOM Elements: Viral View & Tabs ---
    const categoryTabs = document.getElementById('category-tabs');
    const tabButtons = categoryTabs.querySelectorAll('.tab-btn');
    const videoGrid = document.getElementById('video-grid');
    const homeFeedSection = document.getElementById('home-feed-section');
    const homeFeedGrid = document.getElementById('home-feed-grid');
    const seeAllBtn = document.getElementById('see-all-btn');
    if (seeAllBtn) {
        seeAllBtn.addEventListener('click', () => switchView('viral', 'trending'));
    }
    const tmaLoading = document.getElementById('tma-loading');
    const tmaEmpty = document.getElementById('tma-empty');

    // --- DOM Elements: Modal Player (for Viral View cards) ---
    const playerModal = document.getElementById('player-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalVideoTitle = document.getElementById('modal-video-title');
    const modalVideoSize = document.getElementById('modal-video-size');
    const modalVideoDuration = document.getElementById('modal-video-duration');
    const modalVideoQuality = document.getElementById('modal-video-quality');
    const modalVideoViews = document.getElementById('modal-video-views');
    const modalDownloadBtn = document.getElementById('modal-download-btn');
    const modalStdDownloadBtn = document.getElementById('modal-std-download-btn');
    const modalShareBtn = document.getElementById('modal-share-btn');

    // --- State Variables ---
    let currentView = 'home'; // 'home' or 'viral'
    let activeTab = 'trending'; // 'trending', 'latest', 'popular'
    let homeArtPlayerInstance = null;
    let modalArtPlayerInstance = null;
    let currentViralVideos = [];

    // Preferred CSS landscape rotation angle (90 or -90) when phone viewport stays portrait
    let preferredLandscapeAngle = Number(localStorage.getItem('tma_landscape_angle')) || 90;
    if (preferredLandscapeAngle !== 90 && preferredLandscapeAngle !== -90) {
        preferredLandscapeAngle = 90;
    }

    // Listen to device tilt (gravity sensor) to auto-adjust landscape direction when in landscape mode
    window.addEventListener('deviceorientation', (event) => {
        if (typeof event.gamma !== 'number') return;
        const activeArt = modalArtPlayerInstance || homeArtPlayerInstance;
        if (!activeArt || !activeArt._isProLandscape) return;

        if (event.gamma < -45 && preferredLandscapeAngle !== 90) {
            setLandscapeDirection(activeArt, 90, false);
        } else if (event.gamma > 45 && preferredLandscapeAngle !== -90) {
            setLandscapeDirection(activeArt, -90, false);
        }
    });

    // Keep landscape layout synced when viewport resizes or device rotates natively
    window.addEventListener('resize', () => {
        if (homeArtPlayerInstance && homeArtPlayerInstance._isProLandscape) {
            syncLandscapeLayout(homeArtPlayerInstance);
        }
        if (modalArtPlayerInstance && modalArtPlayerInstance._isProLandscape) {
            syncLandscapeLayout(modalArtPlayerInstance);
        }
    });

    if (window.screen?.orientation) {
        window.screen.orientation.addEventListener('change', () => {
            setTimeout(() => {
                if (homeArtPlayerInstance && homeArtPlayerInstance._isProLandscape) {
                    syncLandscapeLayout(homeArtPlayerInstance);
                }
                if (modalArtPlayerInstance && modalArtPlayerInstance._isProLandscape) {
                    syncLandscapeLayout(modalArtPlayerInstance);
                }
            }, 80);
        });
    }

    // Initialize Monetization Manager
    if (window.adManager) {
        window.adManager.init();
    }

    // Toast Helper
    let toastTimer = null;
    function showDownloadToast(message) {
        const toast = document.getElementById('pro-download-toast');
        const toastText = document.getElementById('pro-download-toast-text');
        if (!toast || !toastText) return;
        toastText.textContent = message;
        toast.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 3800);
    }

    // ==========================================
    // 🔀 VIEW SWITCHING LOGIC (HOME vs VIRAL)
    // ==========================================
    function switchView(targetView, targetTab = 'trending') {
        currentView = targetView;
        triggerHaptic('medium');

        if (targetView === 'home') {
            viewHome.style.display = 'block';
            viewViral.style.display = 'none';

            if (tg?.BackButton) {
                tg.BackButton.hide();
            }

            bottomNavItems.forEach(item => {
                item.classList.toggle('active', item.getAttribute('data-view') === 'home');
            });
            loadHomeFeed();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (targetView === 'viral') {
            viewHome.style.display = 'none';
            viewViral.style.display = 'block';

            if (tg?.BackButton) {
                tg.BackButton.show();
                tg.BackButton.onClick(() => switchView('home'));
            }

            setActiveViralTab(targetTab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    if (headerRefreshBtn) {
        headerRefreshBtn.addEventListener('click', async () => {
            triggerHaptic('medium');
            headerRefreshBtn.classList.add('spinning');
            await Promise.all([
                loadHomeFeed(),
                loadViralVideos(activeTab)
            ]);
            setTimeout(() => headerRefreshBtn.classList.remove('spinning'), 500);
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadHomeFeed();
            if (currentView === 'viral') {
                loadViralVideos(activeTab);
            }
        }
    });

    headerViralBtn.addEventListener('click', () => switchView('viral', 'trending'));
    browseViralBtn.addEventListener('click', () => switchView('viral', 'trending'));
    backToHomeBtn.addEventListener('click', () => switchView('home'));

    bottomNavItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            const tab = btn.getAttribute('data-tab');

            if (view === 'home') {
                switchView('home');
            } else if (view === 'viral') {
                switchView('viral', tab || 'trending');
            }
        });
    });

    searchToggleBtn.addEventListener('click', () => {
        triggerHaptic('light');
        if (currentView !== 'home') {
            switchView('home');
        }
        setTimeout(() => {
            linkInput.focus();
            linkInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
    });

    pasteActionBtn.addEventListener('click', async () => {
        triggerHaptic('light');
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                linkInput.value = text.trim();
                linkInput.focus();
            }
        } catch (e) {
            linkInput.focus();
        }
    });

    // ==========================================
    // 🔗 STREAM & DIRECT DOWNLOAD LINK EXTRACTOR HELPERS
    // ==========================================
    /**
     * Collects all valid stream URLs from the video object without filtering out relative paths (/api/...)
     * or query-based streaming URLs. Picks smooth default stream automatically (no quality selector UI).
     */
    function extractStreamCandidates(videoObj) {
        if (!videoObj) return [];
        const candidates = [];

        const addCandidate = (u) => {
            if (u && typeof u === 'string') {
                const trimmed = u.trim();
                if (trimmed && trimmed !== '#' && !candidates.includes(trimmed)) {
                    candidates.push(trimmed);
                }
            }
        };

        // 1. Check fast_stream_url (exactly like original player: prefer 360p/480p/720p first for instant smooth start)
        if (videoObj.fast_stream_url) {
            if (typeof videoObj.fast_stream_url === 'string') {
                addCandidate(videoObj.fast_stream_url);
            } else if (typeof videoObj.fast_stream_url === 'object') {
                const priorityKeys = ['480p', '360p', '720p', '1080p'];
                priorityKeys.forEach(k => {
                    if (videoObj.fast_stream_url[k]) addCandidate(videoObj.fast_stream_url[k]);
                });
                Object.keys(videoObj.fast_stream_url).forEach(k => {
                    addCandidate(videoObj.fast_stream_url[k]);
                });
            }
        }

        // 2. Check primary stream_url
        addCandidate(videoObj.stream_url);

        // 3. Direct MP4 stream fallbacks if HLS fails
        addCandidate(videoObj.fast_dlink);
        addCandidate(videoObj.download_link);
        addCandidate(videoObj.dlink);

        return candidates;
    }

    /**
     * Extracts Fast and Standard direct file download URLs
     */
    function extractDirectDownloadLinks(videoObj) {
        if (!videoObj) return { fastUrl: '', stdUrl: '' };

        const fastUrl = videoObj.fast_dlink || videoObj.download_link || videoObj.dlink || videoObj.stream_url || '';
        const stdUrl = videoObj.download_link || videoObj.dlink || videoObj.fast_dlink || videoObj.stream_url || '';

        return { fastUrl, stdUrl };
    }

    // ==========================================
    // 🎬 HOMEPAGE: PLAY & DOWNLOAD ACTION
    // ==========================================
    playDownloadBtn.addEventListener('click', () => {
        const url = linkInput.value.trim();
        if (!url) {
            alert('Please paste a TeraBox video or folder link first.');
            linkInput.focus();
            return;
        }
        triggerHaptic('medium');
        startHomeStreamWithAd(url);
    });

    linkInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const url = linkInput.value.trim();
            if (url) {
                triggerHaptic('medium');
                startHomeStreamWithAd(url);
            }
        }
    });

    async function startHomeStreamWithAd(url) {
        homeResolvingLoader.style.display = 'block';
        homePlayerSection.style.display = 'none';
        homeResolvingLoader.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const fetchPromise = (async () => {
            const res = await fetch('/api/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await res.json();
            if (!res.ok || data.status === 'error' || !data.list || data.list.length === 0) {
                throw new Error(data.message || 'Failed to extract video from this link.');
            }
            return data;
        })();

        const adPromise = (async () => {
            if (window.adManager) {
                try {
                    await window.adManager.showVideoAd(null, false, 'stream');
                } catch (e) {
                    console.warn('[AdManager] Ad error ignored:', e);
                }
            }
        })();

        try {
            const [data] = await Promise.all([fetchPromise, adPromise]);
            renderHomeStream(data, url);
        } catch (err) {
            homeResolvingLoader.style.display = 'none';
            alert(`Error: ${err.message}`);
        }
    }

    function renderHomeStream(data, sourceShareUrl = '') {
        const video = data.list.find(f => f.type === 'video') || data.list[0];
        if (sourceShareUrl && !video.source_url) {
            video.source_url = sourceShareUrl;
        }

        const fileName = video.name || video.title || 'TeraStream_Video.mp4';
        homeVideoTitle.textContent = fileName;
        homeVideoSize.textContent = `💾 ${video.size_formatted || 'HD'}`;
        homeVideoDuration.textContent = `⏱️ ${video.duration || 'Video'}`;
        homeVideoQuality.textContent = `✨ Auto Smooth HD`;

        const { fastUrl, stdUrl } = extractDirectDownloadLinks(video);

        // Fast Direct Download Button -> Runs Ad EVERY time + Starts Direct Download
        homeFastDownloadBtn.onclick = (e) => {
            e.preventDefault();
            handleRewardedDownload({
                buttonElement: homeFastDownloadBtn,
                downloadUrl: fastUrl,
                sourceUrl: video.source_url || linkInput.value.trim(),
                fileName,
                mode: 'fast'
            });
        };

        // Standard Direct Download Button -> Runs Ad EVERY time + Starts Direct Download
        homeStdDownloadBtn.onclick = (e) => {
            e.preventDefault();
            handleRewardedDownload({
                buttonElement: homeStdDownloadBtn,
                downloadUrl: stdUrl,
                sourceUrl: video.source_url || linkInput.value.trim(),
                fileName,
                mode: 'standard'
            });
        };

        homeCopyLinkBtn.onclick = () => {
            triggerHaptic('light');
            const linkToCopy = fastUrl || stdUrl || video.stream_url || '';
            if (linkToCopy) {
                const fullCopyUrl = new URL(linkToCopy, window.location.origin).href;
                navigator.clipboard.writeText(fullCopyUrl);
                const prev = homeCopyLinkBtn.innerHTML;
                homeCopyLinkBtn.innerHTML = '<span>✅ Direct Link Copied!</span>';
                showDownloadToast('Direct download link copied to clipboard!');
                setTimeout(() => { homeCopyLinkBtn.innerHTML = prev; }, 2000);
            }
        };

        const streamCandidates = extractStreamCandidates(video);

        homeResolvingLoader.style.display = 'none';
        homePlayerSection.style.display = 'block';
        homePlayerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        initHomeArtPlayer(streamCandidates, video.raw_thumbnail || video.thumbnail, fileName);
    }

    // ==========================================
    // 🎥 PRO-LEVEL VIDEO PLAYER FACTORY (NO QUALITY MENU, SMOOTH ABR, GESTURES & FIXED ROTATION)
    // ==========================================
    function initHomeArtPlayer(streamCandidates, poster, title) {
        if (homeArtPlayerInstance) {
            cleanupPlayerInstance(homeArtPlayerInstance);
            homeArtPlayerInstance = null;
        }
        homeArtPlayerInstance = createProArtPlayer('#artplayer-home', streamCandidates, poster, title);
    }

    function initModalArtPlayer(streamCandidates, poster, title) {
        if (modalArtPlayerInstance) {
            cleanupPlayerInstance(modalArtPlayerInstance);
            modalArtPlayerInstance = null;
        }
        modalArtPlayerInstance = createProArtPlayer('#artplayer-tma', streamCandidates, poster, title);
    }

    function cleanupPlayerInstance(art) {
        if (!art) return;
        try {
            exitProLandscape(art);
            if (art.hls) {
                art.hls.destroy();
                art.hls = null;
            }
            art.destroy(false);
        } catch (e) {}
    }

    function createProArtPlayer(containerSelector, candidates, poster, videoTitle = 'Video') {
        const container = document.querySelector(containerSelector);
        if (!container) return null;
        container.innerHTML = '';

        const validCandidates = Array.isArray(candidates) ? candidates.filter(Boolean) : (candidates ? [candidates] : []);
        if (validCandidates.length === 0) {
            container.innerHTML = '<div style="color:#cbd5e1; display:flex; align-items:center; justify-content:center; height:100%; font-size:0.85rem; padding:1rem; text-align:center;">Unable to resolve stream link. Please check the URL or try again.</div>';
            return null;
        }

        let currentCandidateIndex = 0;
        const initialUrl = validCandidates[0];

        // CRITICAL: Always use type: 'm3u8' by default (just like original working player)
        // because TeraBox/proxy HLS URLs often do not end with literal ".m3u8".
        // Inside customType.m3u8, if Hls.js encounters a non-M3U8 direct MP4 stream, it seamlessly falls back to native video.src!
        const art = new Artplayer({
            container: containerSelector,
            url: initialUrl,
            type: 'm3u8',
            poster: poster || '',
            volume: 0.95,
            autoplay: true,
            pip: true,
            autoSize: false,
            autoMini: false,
            setting: false,         // Quality & nested settings removed for clean Pro UI
            playbackRate: false,
            aspectRatio: false,
            autoOrientation: false, // Disabled to prevent 90°+90°=180° opposite-direction bug
            fullscreen: false,      // Handled by unified Pro Landscape Fullscreen control
            fullscreenWeb: false,
            miniProgressBar: true,
            mutex: true,
            backdrop: true,
            playsInline: true,
            fastForward: true,
            lock: false,
            theme: '#ff5533',
            quality: [],            // Quality controls completely removed as requested
            controls: [
                {
                    name: 'proSpeed',
                    position: 'right',
                    index: 10,
                    html: '<span class="pro-ctrl-badge" style="font-family:JetBrains Mono,monospace;font-size:0.72rem;font-weight:700;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,0.12);">1.0x</span>',
                    tooltip: 'Playback Speed',
                    click: function () {
                        cyclePlaybackSpeed(art);
                    }
                },
                {
                    name: 'proFit',
                    position: 'right',
                    index: 15,
                    html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                             <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                           </svg>`,
                    tooltip: 'Screen Fit / Zoom',
                    click: function () {
                        cycleVideoFit(art);
                    }
                },
                {
                    name: 'proFlipDirection',
                    position: 'right',
                    index: 20,
                    html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                             <path d="M17 2.1l4 4-4 4"/>
                             <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8M7 21.9l-4-4 4-4"/>
                             <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2"/>
                           </svg>`,
                    tooltip: 'Flip Landscape Side (180°)',
                    click: function () {
                        flipLandscapeDirection(art);
                    }
                },
                {
                    name: 'proFullscreenLandscape',
                    position: 'right',
                    index: 30,
                    html: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                             <polyline points="15 3 21 3 21 9"></polyline>
                             <polyline points="9 21 3 21 3 15"></polyline>
                             <line x1="21" y1="3" x2="14" y2="10"></line>
                             <line x1="3" y1="21" x2="10" y2="14"></line>
                           </svg>`,
                    tooltip: 'Full Screen Landscape',
                    click: function () {
                        toggleProLandscape(art);
                    }
                }
            ],
            moreVideoAttr: {
                crossOrigin: 'anonymous',
                preload: 'auto',
                playsinline: 'true',
                'webkit-playsinline': 'true'
            },
            customType: {
                m3u8: function (video, m3u8Url, artInstance) {
                    attachSmoothHls(video, m3u8Url, artInstance, () => {
                        currentCandidateIndex++;
                        return validCandidates[currentCandidateIndex] || null;
                    });
                }
            }
        });

        art.on('ready', () => {
            injectProPlayerHud(art, videoTitle);
        });

        art.on('restart', (newUrl) => {
            if (art.hls) {
                art.hls.loadSource(newUrl);
                art.hls.startLoad();
            }
        });

        // Mid-Roll Ads Tracker (Every 5 Minutes of Active Viewing)
        attachMidRollAdTracker(art);

        return art;
    }

    /**
     * Attaches Hls.js exactly like original working player with enhanced smooth buffering
     * and automatic fallback to alternative candidate URLs or native <video> if needed.
     */
    function attachSmoothHls(video, m3u8Url, art, getNextCandidate) {
        if (art.hls) {
            try { art.hls.destroy(); } catch (e) {}
            art.hls = null;
        }

        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                maxBufferLength: 45,
                maxMaxBufferLength: 90,
                maxBufferHole: 0.5,
                manifestLoadingTimeOut: 20000,
                manifestLoadingMaxRetry: 3,
                levelLoadingTimeOut: 20000,
                levelLoadingMaxRetry: 3,
                fragLoadingTimeOut: 25000,
                fragLoadingMaxRetry: 4
            });

            hls.loadSource(m3u8Url);
            hls.attachMedia(video);
            art.hls = hls;

            let mediaRecovered = false;

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (!data.fatal) return;

                if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
                    mediaRecovered = true;
                    hls.recoverMediaError();
                    return;
                }

                // If manifest failed to load/parse, try the next candidate URL or native video playback
                const nextUrl = typeof getNextCandidate === 'function' ? getNextCandidate() : null;
                if (nextUrl) {
                    console.log('[ProPlayer] Trying next stream source:', nextUrl);
                    attachSmoothHls(video, nextUrl, art, getNextCandidate);
                } else {
                    // Fallback: try playing the URL directly as native MP4/WebM in case it's not an M3U8 manifest
                    try { hls.destroy(); } catch (e) {}
                    art.hls = null;
                    video.src = m3u8Url;
                    video.play().catch(() => {});
                }
            });

            art.on('destroy', () => {
                try { hls.destroy(); } catch (e) {}
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = m3u8Url;
            video.addEventListener('loadedmetadata', () => {
                video.play().catch(() => {});
            }, { once: true });
        } else {
            video.src = m3u8Url;
            video.play().catch(() => {});
        }
    }

    // ==========================================
    // 🎛️ PRO PLAYER CUSTOM HUD, GESTURES & ROTATED SCRUBBER
    // ==========================================
    function injectProPlayerHud(art, videoTitle) {
        const playerEl = art.template?.$player;
        const videoEl = art.template?.$video;
        if (!playerEl || !videoEl) return;

        playerEl.classList.add('fit-contain');

        // 1. Top Pro Bar (Title + Flip 180° + Fit + Lock + Exit Fullscreen)
        const topBar = document.createElement('div');
        topBar.className = 'pro-player-top-bar';
        topBar.innerHTML = `
            <div class="pro-top-left">
                <button type="button" class="pro-hud-pill pro-exit-fs-btn" title="Exit Fullscreen" style="display:none;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12"></line>
                        <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                </button>
                <span class="pro-top-title">${videoTitle || 'Now Playing'}</span>
            </div>
            <div class="pro-top-actions">
                <button type="button" class="pro-hud-pill pro-flip-btn" title="Flip Landscape Direction (180°)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 0 1-4 4H4.2"/>
                    </svg>
                    <span>Flip</span>
                </button>
                <button type="button" class="pro-hud-pill pro-fit-btn" title="Toggle Screen Fit">
                    <span>Fit</span>
                </button>
                <button type="button" class="pro-hud-pill pro-lock-btn" title="Lock Controls">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </button>
            </div>
        `;
        playerEl.appendChild(topBar);

        // 2. Center Quick Controls (-10s, Play/Pause, +10s)
        const centerControls = document.createElement('div');
        centerControls.className = 'pro-center-controls';
        centerControls.innerHTML = `
            <button type="button" class="pro-center-btn rewind-btn" aria-label="Rewind 10 seconds">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
                <span>-10s</span>
            </button>
            <button type="button" class="pro-center-btn play-main" aria-label="Play or Pause">
                <svg class="pro-play-svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6 4 20 12 6 20 6 4"></polygon>
                </svg>
            </button>
            <button type="button" class="pro-center-btn forward-btn" aria-label="Forward 10 seconds">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                <span>+10s</span>
            </button>
        `;
        playerEl.appendChild(centerControls);

        // 3. Double-Tap Ripple Badges
        const rippleLeft = document.createElement('div');
        rippleLeft.className = 'pro-seek-ripple left';
        rippleLeft.textContent = '⏪ -10s';
        const rippleRight = document.createElement('div');
        rippleRight.className = 'pro-seek-ripple right';
        rippleRight.textContent = '⏩ +10s';
        playerEl.appendChild(rippleLeft);
        playerEl.appendChild(rippleRight);

        // 4. Floating Screen Unlock Pill
        const unlockBtn = document.createElement('button');
        unlockBtn.type = 'button';
        unlockBtn.className = 'pro-unlock-btn';
        unlockBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff5533" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
            </svg>
            <span>Tap to Unlock Controls</span>
        `;
        playerEl.appendChild(unlockBtn);

        // Sync Center Play/Pause Icon with Video State
        const playMainBtn = centerControls.querySelector('.play-main');
        const updatePlayIcon = () => {
            if (!playMainBtn) return;
            if (art.playing) {
                playMainBtn.innerHTML = `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                        <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                    </svg>
                `;
            } else {
                playMainBtn.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-left:2px;">
                        <polygon points="6 4 20 12 6 20 6 4"></polygon>
                    </svg>
                `;
            }
        };
        art.on('play', updatePlayIcon);
        art.on('pause', updatePlayIcon);
        art.on('video:playing', updatePlayIcon);
        art.on('video:pause', updatePlayIcon);
        updatePlayIcon();

        // Wire up Center Buttons
        const rewindBtn = centerControls.querySelector('.rewind-btn');
        const forwardBtn = centerControls.querySelector('.forward-btn');

        const showSeekRipple = (side) => {
            const el = side === 'left' ? rippleLeft : rippleRight;
            el.classList.add('show');
            clearTimeout(el._timer);
            el._timer = setTimeout(() => el.classList.remove('show'), 650);
        };

        rewindBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerHaptic('light');
            art.backward = 10;
            showSeekRipple('left');
        });

        forwardBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerHaptic('light');
            art.forward = 10;
            showSeekRipple('right');
        });

        playMainBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerHaptic('light');
            art.toggle();
        });

        // Wire up Top Bar Actions
        const exitFsBtn = topBar.querySelector('.pro-exit-fs-btn');
        const flipBtn = topBar.querySelector('.pro-flip-btn');
        const fitBtn = topBar.querySelector('.pro-fit-btn');
        const lockBtn = topBar.querySelector('.pro-lock-btn');

        exitFsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exitProLandscape(art);
        });

        flipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            flipLandscapeDirection(art);
        });

        fitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cycleVideoFit(art, fitBtn.querySelector('span'));
        });

        lockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerHaptic('medium');
            playerEl.classList.add('pro-screen-locked');
            art.notice.show = 'Screen Controls Locked 🔒';
        });

        unlockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerHaptic('medium');
            playerEl.classList.remove('pro-screen-locked');
            art.controls.show = true;
            art.notice.show = 'Controls Unlocked 🔓';
        });

        // Double-Tap Left/Right Edge Gesture Seek on Video Layer
        let lastTapTime = 0;
        let lastTapSide = null;
        videoEl.addEventListener('touchend', (e) => {
            if (playerEl.classList.contains('pro-screen-locked')) return;
            if (!e.changedTouches || e.changedTouches.length === 0) return;

            const touch = e.changedTouches[0];
            const rect = playerEl.getBoundingClientRect();
            const container = art.template?.$container;
            const isRotatedCss = container && container.classList.contains('art-pro-landscape-rotated');

            let relativePos = 0.5;
            if (isRotatedCss) {
                const normY = (touch.clientY - rect.top) / Math.max(1, rect.height);
                relativePos = preferredLandscapeAngle === 90 ? normY : (1 - normY);
            } else {
                relativePos = (touch.clientX - rect.left) / Math.max(1, rect.width);
            }

            const side = relativePos < 0.35 ? 'left' : (relativePos > 0.65 ? 'right' : 'center');
            const now = Date.now();

            if (side !== 'center' && (now - lastTapTime < 280) && lastTapSide === side) {
                e.preventDefault();
                triggerHaptic('light');
                if (side === 'left') {
                    art.backward = 10;
                    showSeekRipple('left');
                } else {
                    art.forward = 10;
                    showSeekRipple('right');
                }
                lastTapTime = 0;
            } else {
                lastTapTime = now;
                lastTapSide = side;
            }
        }, { passive: false });

        // 5. Rotated Landscape Touch Scrubber Fix
        const progressEl = playerEl.querySelector('.art-control-progress');
        if (progressEl) {
            const handleRotatedSeek = (e) => {
                const container = art.template?.$container;
                if (!container || !container.classList.contains('art-pro-landscape-rotated')) {
                    return;
                }
                if (!art.duration || art.duration <= 0) return;

                const touch = e.touches?.[0] || e.changedTouches?.[0] || e;
                if (typeof touch.clientY !== 'number') return;

                e.stopPropagation();
                if (e.cancelable) e.preventDefault();

                const rect = progressEl.getBoundingClientRect();
                const rawRatio = (touch.clientY - rect.top) / Math.max(1, rect.height);
                const ratio = preferredLandscapeAngle === 90
                    ? Math.min(1, Math.max(0, rawRatio))
                    : Math.min(1, Math.max(0, 1 - rawRatio));

                art.seek = ratio * art.duration;
            };

            progressEl.addEventListener('touchstart', handleRotatedSeek, { capture: true, passive: false });
            progressEl.addEventListener('touchmove', handleRotatedSeek, { capture: true, passive: false });
        }

        art._exitFsBtn = exitFsBtn;
    }

    function cyclePlaybackSpeed(art) {
        if (!art) return;
        triggerHaptic('light');
        const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
        const current = art.playbackRate || 1.0;
        const nextIndex = (speeds.indexOf(current) + 1) % speeds.length;
        const nextSpeed = speeds[nextIndex];
        art.playbackRate = nextSpeed;

        const badge = art.template?.$player?.querySelector('.pro-ctrl-badge');
        if (badge) {
            badge.textContent = `${nextSpeed}x`;
        }
        art.notice.show = `Playback Speed: ${nextSpeed}x`;
    }

    function cycleVideoFit(art, topFitSpan = null) {
        if (!art || !art.template?.$player) return;
        triggerHaptic('light');
        const playerEl = art.template.$player;
        const btn = topFitSpan || playerEl.querySelector('.pro-fit-btn span');

        if (playerEl.classList.contains('fit-contain')) {
            playerEl.classList.remove('fit-contain');
            playerEl.classList.add('fit-cover');
            if (btn) btn.textContent = 'Zoom';
            art.notice.show = 'Screen Fit: Widescreen Zoom';
        } else if (playerEl.classList.contains('fit-cover')) {
            playerEl.classList.remove('fit-cover');
            playerEl.classList.add('fit-fill');
            if (btn) btn.textContent = 'Stretch';
            art.notice.show = 'Screen Fit: Full Stretch';
        } else {
            playerEl.classList.remove('fit-fill', 'fit-cover');
            playerEl.classList.add('fit-contain');
            if (btn) btn.textContent = 'Fit';
            art.notice.show = 'Screen Fit: Original Fit';
        }
    }

    // ==========================================
    // 🔄 PRO LANDSCAPE FULLSCREEN ENGINE (NO DOUBLE-ROTATION, SMOOTH ANIMATION + 180° FLIP)
    // ==========================================
    function toggleProLandscape(art) {
        if (!art) return;
        triggerHaptic('medium');
        if (art._isProLandscape) {
            exitProLandscape(art);
        } else {
            enterProLandscape(art);
        }
    }

    function enterProLandscape(art) {
        if (!art || !art.template?.$container) return;
        const container = art.template.$container;
        art._isProLandscape = true;

        document.body.classList.add('pro-landscape-lock');
        if (playerModal && playerModal.style.display !== 'none') {
            playerModal.classList.add('is-landscape-fullscreen');
        }
        if (art._exitFsBtn) {
            art._exitFsBtn.style.display = 'inline-flex';
        }

        try {
            if (window.Telegram?.WebApp?.requestFullscreen) {
                window.Telegram.WebApp.requestFullscreen();
            }
        } catch (e) {}

        try {
            if (screen.orientation?.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            }
        } catch (e) {}

        container.style.setProperty('--landscape-angle', `${preferredLandscapeAngle}deg`);
        syncLandscapeLayout(art);

        setTimeout(() => syncLandscapeLayout(art), 100);
        setTimeout(() => syncLandscapeLayout(art), 300);

        try {
            art.notice.show = 'Landscape Fullscreen • Tap "Flip" to rotate 180°';
        } catch (e) {}
    }

    function syncLandscapeLayout(art) {
        if (!art || !art.template?.$container) return;
        const container = art.template.$container;

        if (!art._isProLandscape) {
            container.classList.remove('art-pro-landscape-rotated', 'art-pro-fullscreen-native');
            return;
        }

        // If the phone viewport itself rotated into landscape (width > height), do NOT apply 90deg CSS rotation!
        if (window.innerWidth > window.innerHeight) {
            container.classList.remove('art-pro-landscape-rotated');
            container.classList.add('art-pro-fullscreen-native');
        } else {
            container.classList.remove('art-pro-fullscreen-native');
            container.style.setProperty('--landscape-angle', `${preferredLandscapeAngle}deg`);
            container.classList.add('art-pro-landscape-rotated');
        }
    }

    function setLandscapeDirection(art, angle, showNotice = true) {
        preferredLandscapeAngle = angle === -90 ? -90 : 90;
        try {
            localStorage.setItem('tma_landscape_angle', String(preferredLandscapeAngle));
        } catch (e) {}

        if (!art || !art.template?.$container) return;
        const container = art.template.$container;
        container.style.setProperty('--landscape-angle', `${preferredLandscapeAngle}deg`);

        if (showNotice) {
            try {
                art.notice.show = preferredLandscapeAngle === 90
                    ? 'Rotated Landscape Left (90°)'
                    : 'Rotated Landscape Right (-90°)';
            } catch (e) {}
        }
    }

    function flipLandscapeDirection(art) {
        if (!art) return;
        triggerHaptic('medium');

        if (!art._isProLandscape) {
            enterProLandscape(art);
            return;
        }

        const nextAngle = preferredLandscapeAngle === 90 ? -90 : 90;
        setLandscapeDirection(art, nextAngle, true);

        const container = art.template?.$container;
        if (container && window.innerHeight >= window.innerWidth) {
            container.classList.remove('art-pro-fullscreen-native');
            container.classList.add('art-pro-landscape-rotated');
        }
    }

    function exitProLandscape(art) {
        if (!art || !art.template?.$container) return;
        const container = art.template.$container;
        art._isProLandscape = false;

        container.classList.remove('art-pro-landscape-rotated', 'art-pro-fullscreen-native');
        document.body.classList.remove('pro-landscape-lock');
        if (playerModal) {
            playerModal.classList.remove('is-landscape-fullscreen');
        }
        if (art._exitFsBtn) {
            art._exitFsBtn.style.display = 'none';
        }
        if (art.template?.$player) {
            art.template.$player.classList.remove('pro-screen-locked');
        }

        try {
            if (screen.orientation?.unlock) {
                screen.orientation.unlock();
            }
        } catch (e) {}
        try {
            if (window.Telegram?.WebApp?.exitFullscreen) {
                window.Telegram.WebApp.exitFullscreen();
            }
        } catch (e) {}
    }

    // ==========================================
    // 🔥 VIRAL VIEW: TABS & CARDS FEED
    // ==========================================
    function setActiveViralTab(tab) {
        activeTab = tab;
        triggerHaptic('light');

        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });

        bottomNavItems.forEach(item => {
            if (item.getAttribute('data-view') === 'viral') {
                item.classList.toggle('active', item.getAttribute('data-tab') === tab);
            } else {
                item.classList.remove('active');
            }
        });

        loadViralVideos(tab);
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            setActiveViralTab(tab);
        });
    });

    async function loadHomeFeed() {
        if (!homeFeedGrid) return;
        try {
            const res = await fetch(`/api/tma/videos?category=all&_t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            const data = await res.json();
            if (data.status === 'success' && data.items) {
                renderHomeFeed(data.items);
            } else {
                renderHomeFeed([]);
            }
        } catch (e) {
            console.error('[TMA] Failed to load home feed:', e);
            renderHomeFeed([]);
        }
    }

    function renderHomeFeed(videos) {
        if (!homeFeedGrid) return;
        homeFeedGrid.innerHTML = '';

        if (!videos || videos.length === 0) {
            if (homeFeedSection) homeFeedSection.style.display = 'none';
            return;
        }

        if (homeFeedSection) homeFeedSection.style.display = 'block';
        videos.forEach(video => {
            const card = createVideoCard(video);
            homeFeedGrid.appendChild(card);
        });
    }

    async function loadViralVideos(category) {
        showViralLoading();
        try {
            const res = await fetch(`/api/tma/videos?category=${encodeURIComponent(category)}&_t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            const data = await res.json();

            if (data.status === 'success' && data.items) {
                currentViralVideos = data.items;
                renderViralGrid(currentViralVideos);
            } else {
                renderViralGrid([]);
            }
        } catch (e) {
            console.error('[TMA] Failed to load viral videos:', e);
            renderViralGrid([]);
        } finally {
            hideViralLoading();
        }
    }

    function renderViralGrid(videos) {
        videoGrid.innerHTML = '';

        if (!videos || videos.length === 0) {
            tmaEmpty.style.display = 'block';
            return;
        }

        tmaEmpty.style.display = 'none';
        videos.forEach(video => {
            const card = createVideoCard(video);
            videoGrid.appendChild(card);
        });
    }

    function createVideoCard(video) {
        const card = document.createElement('div');
        card.className = 'tma-card';

        const thumb = video.thumbnail || 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=400&q=80';
        const badge = video.badge || (activeTab === 'trending' ? '🔥 Trending' : (activeTab === 'popular' ? '⭐ Popular' : '🆕 Latest'));

        card.innerHTML = `
            <div class="thumb-box">
                <img src="${thumb}" class="thumb-img" alt="${video.title}" onerror="this.src='https://images.unsplash.com/photo-1536240478700-b869070f9279?w=400&q=80'">
                <span class="badge-top-left">${badge}</span>
                <span class="duration-pill">${video.duration || 'HD'}</span>
                <div class="play-overlay">
                    <div class="play-icon-glow">▶</div>
                </div>
            </div>
            <div class="card-info">
                <div class="card-title">${video.title}</div>
                <div class="card-meta">
                    <span>👁️ ${video.views || '15K'} views</span>
                    <span>💾 ${video.size_formatted || 'HD'}</span>
                </div>
            </div>
        `;

        card.addEventListener('click', async () => {
            triggerHaptic('medium');

            const adPromise = (async () => {
                if (window.adManager) {
                    try { await window.adManager.showVideoAd(null, false, 'stream'); } catch (e) {}
                }
            })();

            const resolvePromise = (async () => {
                if (!video.stream_url && video.url) {
                    try {
                        const res = await fetch('/api/stream', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: video.url })
                        });
                        const d = await res.json();
                        const matched = d.list?.find(x => x.type === 'video') || d.list?.[0];
                        if (matched) {
                            video.stream_url = matched.stream_url || video.stream_url;
                            video.fast_stream_url = matched.fast_stream_url || video.fast_stream_url;
                            video.fast_dlink = matched.fast_dlink || video.fast_dlink;
                            video.download_link = matched.download_link || matched.dlink || video.download_link;
                            video.dlink = matched.dlink || video.dlink;
                            video.size_formatted = matched.size_formatted || video.size_formatted;
                            video.duration = matched.duration || video.duration;
                        }
                    } catch (e) {}
                }
            })();

            await Promise.all([adPromise, resolvePromise]);
            openModalPlayer(video);
        });

        return card;
    }

    // Modal Player for Viral View Cards
    async function openModalPlayer(video) {
        const fileName = video.title || video.name || 'TeraStream_Video.mp4';
        modalVideoTitle.textContent = fileName;
        modalVideoSize.textContent = `💾 ${video.size_formatted || 'HD'}`;
        modalVideoDuration.textContent = `⏱️ ${video.duration || 'Video'}`;
        modalVideoQuality.textContent = `✨ Auto Smooth HD`;
        modalVideoViews.textContent = `👁️ ${video.views || '12K views'}`;

        playerModal.style.display = 'flex';

        if (!video.stream_url && video.url) {
            try {
                const res = await fetch('/api/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: video.url })
                });
                const d = await res.json();
                const matched = d.list?.find(x => x.type === 'video') || d.list?.[0];
                if (matched) {
                    video.stream_url = matched.stream_url || video.stream_url;
                    video.fast_stream_url = matched.fast_stream_url || video.fast_stream_url;
                    video.fast_dlink = matched.fast_dlink || video.fast_dlink;
                    video.download_link = matched.download_link || matched.dlink || video.download_link;
                    video.dlink = matched.dlink || video.dlink;
                }
            } catch (e) {
                console.error('Failed to resolve stream in modal:', e);
            }
        }

        const { fastUrl, stdUrl } = extractDirectDownloadLinks(video);

        // Modal Fast Direct Download -> Runs Ad EVERY time + Starts Direct Download
        modalDownloadBtn.onclick = (e) => {
            e.preventDefault();
            handleRewardedDownload({
                buttonElement: modalDownloadBtn,
                downloadUrl: fastUrl,
                sourceUrl: video.url || '',
                fileName,
                mode: 'fast'
            });
        };

        // Modal Standard Direct Download -> Runs Ad EVERY time + Starts Direct Download
        if (modalStdDownloadBtn) {
            modalStdDownloadBtn.onclick = (e) => {
                e.preventDefault();
                handleRewardedDownload({
                    buttonElement: modalStdDownloadBtn,
                    downloadUrl: stdUrl,
                    sourceUrl: video.url || '',
                    fileName,
                    mode: 'standard'
                });
            };
        }

        // Telegram Share
        modalShareBtn.onclick = () => {
            triggerHaptic('light');
            const shareText = `Watch "${fileName}" on TeraStream! 🍿`;
            const shareUrl = window.location.href;
            if (tg && tg.openTelegramLink) {
                tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`);
            } else {
                navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                showDownloadToast('Share link copied to clipboard!');
            }
        };

        const streamCandidates = extractStreamCandidates(video);
        initModalArtPlayer(streamCandidates, video.thumbnail, fileName);
    }

    function closeModal() {
        triggerHaptic('light');
        if (modalArtPlayerInstance) {
            cleanupPlayerInstance(modalArtPlayerInstance);
            modalArtPlayerInstance = null;
        }
        playerModal.style.display = 'none';
    }

    // ==========================================
    // ⏱️ MID-ROLL AD TRACKER (EVERY 5 MINUTES OF ACTIVE PLAYBACK)
    // ==========================================
    function attachMidRollAdTracker(art) {
        if (!art) return;
        let activeWatchSeconds = 0;
        const MID_ROLL_INTERVAL = 5 * 60; // 5 Minutes
        let isAdPlaying = false;

        const interval = setInterval(async () => {
            if (!art || art.isDestroy) {
                clearInterval(interval);
                return;
            }

            if (art.playing && !isAdPlaying) {
                activeWatchSeconds++;

                if (activeWatchSeconds >= MID_ROLL_INTERVAL) {
                    activeWatchSeconds = 0;
                    isAdPlaying = true;
                    console.log('[Mid-Roll Ad] 5 minutes active playback reached! Pausing and showing ad...');

                    try { art.pause(); } catch (e) {}
                    try { art.notice.show = 'Sponsor Ad Break — Resuming video soon...'; } catch (e) {}

                    try {
                        if (window.adManager) {
                            await window.adManager.showVideoAd(null, true, 'midroll');
                        }
                    } catch (err) {
                        console.warn('[Mid-Roll Ad] Ad error or dismissed:', err);
                    } finally {
                        isAdPlaying = false;
                        try { art.notice.show = 'Resuming playback ▶'; } catch (e) {}
                        setTimeout(() => {
                            try { art.play(); } catch (e) {}
                        }, 450);
                    }
                }
            }
        }, 1000);

        art.on('destroy', () => {
            clearInterval(interval);
        });
    }

    // ==========================================
    // ⚡ REWARDED DIRECT DOWNLOAD ENGINE (FAST & STANDARD — RUNS AD EVERY TIME & DIRECT DOWNLOADS WITHOUT WEBPAGE)
    // ==========================================
    function sanitizeDownloadFileName(rawName) {
        let clean = (rawName || 'TeraStream_Video')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .trim();
        if (!/\.(mp4|mkv|webm|mov|avi)$/i.test(clean)) {
            clean += '.mp4';
        }
        return clean;
    }

    async function handleRewardedDownload({ buttonElement, downloadUrl, sourceUrl = '', fileName = 'video.mp4', mode = 'fast' }) {
        triggerHaptic('medium');

        const originalHtml = buttonElement.innerHTML;
        buttonElement.style.pointerEvents = 'none';
        buttonElement.disabled = true;
        buttonElement.innerHTML = `
            <span class="btn-spinner"></span>
            <span>Loading Sponsor Ad & Preparing File...</span>
        `;

        // 1. Concurrently resolve fresh direct download URL if needed while the Ad is displayed
        const resolveFreshLinkPromise = (async () => {
            if (downloadUrl && downloadUrl !== '#') {
                return downloadUrl;
            }
            if (!sourceUrl) return downloadUrl || '';
            try {
                const res = await fetch('/api/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: sourceUrl })
                });
                const d = await res.json();
                const matched = d.list?.find(x => x.type === 'video') || d.list?.[0];
                if (matched) {
                    const links = extractDirectDownloadLinks(matched);
                    return mode === 'standard' ? (links.stdUrl || links.fastUrl) : (links.fastUrl || links.stdUrl);
                }
            } catch (err) {
                console.warn('[Direct Download] Fresh link resolution failed:', err);
            }
            return downloadUrl || '';
        })();

        // 2. ALWAYS show Rewarded / Interstitial Ad on EVERY download click (both Fast & Standard)
        const adPromise = (async () => {
            if (window.adManager) {
                console.log(`[Direct Download] Triggering mandatory Ad for ${mode} download...`);
                await window.adManager.showDownloadAd();
            }
        })();

        let finalDownloadUrl = '';
        try {
            const [resolvedUrl] = await Promise.all([resolveFreshLinkPromise, adPromise]);
            finalDownloadUrl = resolvedUrl;
        } catch (e) {
            console.warn('[Direct Download] Error during ad/resolve:', e);
            finalDownloadUrl = downloadUrl;
        }

        if (!finalDownloadUrl || finalDownloadUrl === '#') {
            buttonElement.innerHTML = originalHtml;
            buttonElement.style.pointerEvents = 'auto';
            buttonElement.disabled = false;
            showDownloadToast('Direct file link is still generating. Please try again.');
            return;
        }

        const safeFileName = sanitizeDownloadFileName(fileName);

        buttonElement.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Downloading Directly...</span>
        `;

        // 3. Trigger Direct File Download (Without opening a browser webpage!)
        triggerDirectDownload(finalDownloadUrl, safeFileName, mode);

        setTimeout(() => {
            buttonElement.innerHTML = originalHtml;
            buttonElement.style.pointerEvents = 'auto';
            buttonElement.disabled = false;
        }, 3200);
    }

    /**
     * Starts a direct binary file download inside Telegram Mini App / WebView
     * WITHOUT calling tg.openLink() (which previously opened an external webpage).
     */
    function triggerDirectDownload(url, fileName, mode = 'fast') {
        if (!url) return;

        // Ensure full absolute URL for Telegram downloadFile API
        let absoluteUrl = url;
        try {
            absoluteUrl = new URL(url, window.location.origin).href;
        } catch (e) {}

        showDownloadToast(`Starting ${mode === 'fast' ? 'Fast' : 'Standard'} Download: ${fileName}`);

        // Method 1: Telegram Native File Download API (Bot API 8.0+)
        if (tg && typeof tg.downloadFile === 'function') {
            try {
                tg.downloadFile({ url: absoluteUrl, file_name: fileName }, (accepted) => {
                    if (!accepted) {
                        triggerInAppStreamDownload(absoluteUrl, fileName);
                    }
                });
                return;
            } catch (err) {
                console.warn('[Direct Download] tg.downloadFile fallback to in-app stream:', err);
            }
        }

        // Method 2: In-App Hidden Iframe + Direct Download Anchor (No target="_blank", stays inside player)
        triggerInAppStreamDownload(absoluteUrl, fileName);
    }

    function triggerInAppStreamDownload(url, fileName) {
        try {
            const a = document.createElement('a');
            a.href = url;
            a.setAttribute('download', fileName || 'video.mp4');
            a.rel = 'noopener';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                try { document.body.removeChild(a); } catch (e) {}
            }, 1500);

            const sandbox = document.getElementById('direct-download-sandbox');
            if (sandbox) {
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = url;
                sandbox.appendChild(iframe);
                setTimeout(() => {
                    try { sandbox.removeChild(iframe); } catch (e) {}
                }, 60000);
            }
        } catch (err) {
            console.error('[Direct Download] Fallback error:', err);
        }
    }

    modalCloseBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);

    // Helpers
    function showViralLoading() {
        tmaLoading.style.display = 'block';
        videoGrid.style.display = 'none';
        tmaEmpty.style.display = 'none';
    }

    function hideViralLoading() {
        tmaLoading.style.display = 'none';
        videoGrid.style.display = 'grid';
    }

    // Default start view
    switchView('home');
    loadHomeFeed();
    loadViralVideos('trending');
});
