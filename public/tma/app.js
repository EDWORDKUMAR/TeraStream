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
    const modalShareBtn = document.getElementById('modal-share-btn');

    // State Variables
    let currentView = 'home'; // 'home' or 'viral'
    let activeTab = 'trending'; // 'trending', 'latest', 'popular'
    let homeArtPlayerInstance = null;
    let modalArtPlayerInstance = null;
    let currentViralVideos = [];

    // Initialize Monetization Manager
    if (window.adManager) {
        window.adManager.init();
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

            // Telegram Native BackButton
            if (tg?.BackButton) {
                tg.BackButton.hide();
            }

            // Update bottom nav
            bottomNavItems.forEach(item => {
                item.classList.toggle('active', item.getAttribute('data-view') === 'home');
            });
            // Immediately refresh the Home Feed when switching to Home
            loadHomeFeed();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (targetView === 'viral') {
            viewHome.style.display = 'none';
            viewViral.style.display = 'block';

            // Telegram Native BackButton
            if (tg?.BackButton) {
                tg.BackButton.show();
                tg.BackButton.onClick(() => switchView('home'));
            }

            // Set tab inside viral view
            setActiveViralTab(targetTab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // Header Refresh button (Instant 1-tap refresh for both feeds)
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

    // Auto-refresh when user returns to TMA or switches back to Telegram
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadHomeFeed();
            if (currentView === 'viral') {
                loadViralVideos(activeTab);
            }
        }
    });

    // Header Viral button click
    headerViralBtn.addEventListener('click', () => switchView('viral', 'trending'));

    // Homepage Browse Viral banner button click
    browseViralBtn.addEventListener('click', () => switchView('viral', 'trending'));

    // Back to home button click
    backToHomeBtn.addEventListener('click', () => switchView('home'));

    // Bottom Navigation Bar
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

    // Header Search Icon click -> Focus input
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

    // Paste Action Button
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
    // 🎬 HOMEPAGE: PLAY & DOWNLOAD ACTION (CONCURRENT STREAM RESOLVE + AD)
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
        // 1. Immediately show resolving loader on screen
        homeResolvingLoader.style.display = 'block';
        homePlayerSection.style.display = 'none';
        homeResolvingLoader.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 2. Fetch video data concurrently in the background
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

        // 3. Trigger Adsgram Rewarded Video at the exact same time
        const adPromise = (async () => {
            if (window.adManager) {
                try {
                    await window.adManager.showVideoAd();
                } catch (e) {
                    console.warn('[AdManager] Ad error ignored:', e);
                }
            }
        })();

        // 4. Wait for both to finish (ad completed/skipped + full video stream resolved in background)
        try {
            const [data] = await Promise.all([fetchPromise, adPromise]);
            renderHomeStream(data);
        } catch (err) {
            homeResolvingLoader.style.display = 'none';
            alert(`Error: ${err.message}`);
        }
    }

    function renderHomeStream(data) {
        const video = data.list.find(f => f.type === 'video') || data.list[0];

        // Populate Video Info
        homeVideoTitle.textContent = video.name;
        homeVideoSize.textContent = `💾 ${video.size_formatted || 'N/A'}`;
        homeVideoDuration.textContent = `⏱️ ${video.duration || 'Video'}`;
        homeVideoQuality.textContent = `✨ ${video.quality || '1080p HD'}`;

        // Setup Download Buttons Underneath Player
        const downloadUrl = video.fast_dlink || video.stream_url || video.download_link;
        homeFastDownloadBtn.href = downloadUrl;
        homeStdDownloadBtn.href = downloadUrl;

        homeCopyLinkBtn.onclick = () => {
            triggerHaptic('light');
            navigator.clipboard.writeText(downloadUrl);
            const prev = homeCopyLinkBtn.innerHTML;
            homeCopyLinkBtn.innerHTML = '<span>✅ Stream Link Copied!</span>';
            setTimeout(() => { homeCopyLinkBtn.innerHTML = prev; }, 2000);
        };

        // Setup Quality List
        let qualityList = [];
        let chosenStreamUrl = video.stream_url;

        if (video.fast_stream_url && typeof video.fast_stream_url === 'object') {
            const keys = Object.keys(video.fast_stream_url);
            if (keys.length > 0) {
                qualityList = keys.map(q => ({
                    html: q,
                    url: video.fast_stream_url[q],
                    default: q === '360p' || q === '480p'
                }));
                const chosen = qualityList.find(q => q.default) || qualityList[0];
                chosenStreamUrl = chosen.url;
            }
        }

        // Show player container
        homeResolvingLoader.style.display = 'none';
        homePlayerSection.style.display = 'block';
        homePlayerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Initialize ArtPlayer on homepage
        initHomeArtPlayer(chosenStreamUrl, video.raw_thumbnail || video.thumbnail, qualityList);
    }

    function initHomeArtPlayer(streamUrl, poster, qualityList = []) {
        if (homeArtPlayerInstance) {
            try { homeArtPlayerInstance.destroy(false); } catch (e) {}
            homeArtPlayerInstance = null;
        }

        const container = document.getElementById('artplayer-home');
        container.innerHTML = '';

        homeArtPlayerInstance = new Artplayer({
            container: '#artplayer-home',
            url: streamUrl,
            type: 'm3u8',
            poster: poster || '',
            volume: 0.9,
            autoplay: true,
            pip: true,
            setting: true,
            fullscreen: true,
            fullscreenWeb: true,
            theme: '#6366f1',
            quality: qualityList.length > 1 ? qualityList : [],
            moreVideoAttr: {
                crossOrigin: 'anonymous',
                preload: 'auto',
                playsinline: 'true'
            },
            customType: {
                m3u8: function (video, m3u8Url, art) {
                    if (Hls.isSupported()) {
                        if (art.hls) {
                            try { art.hls.destroy(); } catch (e) {}
                        }
                        const hls = new Hls({
                            enableWorker: true,
                            manifestLoadingTimeOut: 20000,
                            levelLoadingTimeOut: 20000
                        });
                        hls.loadSource(m3u8Url);
                        hls.attachMedia(video);
                        art.hls = hls;

                        hls.on(Hls.Events.MANIFEST_PARSED, () => {
                            video.play().catch(() => {});
                        });

                        art.on('destroy', () => {
                            try { hls.destroy(); } catch (e) {}
                        });
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = m3u8Url;
                    }
                }
            }
        });

        homeArtPlayerInstance.on('restart', (newUrl) => {
            if (homeArtPlayerInstance.hls) {
                homeArtPlayerInstance.hls.loadSource(newUrl);
                homeArtPlayerInstance.hls.startLoad();
            }
        });
    }

    // ==========================================
    // 🔥 VIRAL VIEW: TABS & CARDS FEED
    // ==========================================
    function setActiveViralTab(tab) {
        activeTab = tab;
        triggerHaptic('light');

        // Update tab buttons
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });

        // Update bottom nav
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

    // --- Dedicated Homepage Feed Loader (Never overwritten by tab switching) ---
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

    // --- Dedicated Viral Hub Loader ---
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

            // Concurrent Ad + Background Stream Pre-resolution
            const adPromise = (async () => {
                if (window.adManager) {
                    try { await window.adManager.showVideoAd(); } catch (e) {}
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
                            video.stream_url = matched.stream_url;
                            video.fast_stream_url = matched.fast_stream_url;
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
        modalVideoTitle.textContent = video.title;
        modalVideoSize.textContent = `💾 ${video.size_formatted || 'N/A'}`;
        modalVideoDuration.textContent = `⏱️ ${video.duration || 'Video'}`;
        modalVideoQuality.textContent = `✨ ${video.quality || '1080p HD'}`;
        modalVideoViews.textContent = `👁️ ${video.views || '12K views'}`;

        playerModal.style.display = 'flex';

        // Setup Fast Download button in modal
        const dlLink = video.stream_url ? `/api/proxy/stream.m3u8?url=${encodeURIComponent(video.url)}` : video.url;
        modalDownloadBtn.href = dlLink;

        // Telegram Share
        modalShareBtn.onclick = () => {
            triggerHaptic('light');
            const shareText = `Watch "${video.title}" on TeraStream! 🍿`;
            const shareUrl = window.location.href;
            if (tg && tg.openTelegramLink) {
                tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`);
            } else {
                navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                alert('Share link copied to clipboard!');
            }
        };

        // Determine stream URL
        let streamUrl = video.stream_url;
        let qualityList = [];

        if (video.fast_stream_url && typeof video.fast_stream_url === 'object') {
            const keys = Object.keys(video.fast_stream_url);
            if (keys.length > 0) {
                qualityList = keys.map(q => ({
                    html: q,
                    url: video.fast_stream_url[q],
                    default: q === '360p' || q === '480p'
                }));
                const chosen = qualityList.find(q => q.default) || qualityList[0];
                streamUrl = chosen.url;
            }
        }

        if (!streamUrl && video.url) {
            try {
                const res = await fetch('/api/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: video.url })
                });
                const d = await res.json();
                const matched = d.list?.find(x => x.type === 'video') || d.list?.[0];
                if (matched?.stream_url) {
                    streamUrl = matched.stream_url;
                    if (matched.fast_stream_url) {
                        qualityList = Object.keys(matched.fast_stream_url).map(q => ({
                            html: q,
                            url: matched.fast_stream_url[q],
                            default: q === '360p'
                        }));
                    }
                }
            } catch (e) {
                console.error('Failed to resolve stream:', e);
            }
        }

        initModalArtPlayer(streamUrl, video.thumbnail, qualityList);
    }

    function initModalArtPlayer(url, poster, qualityList = []) {
        if (modalArtPlayerInstance) {
            try { modalArtPlayerInstance.destroy(false); } catch (e) {}
            modalArtPlayerInstance = null;
        }

        const container = document.getElementById('artplayer-tma');
        container.innerHTML = '';

        if (!url) {
            container.innerHTML = '<div style="color:#fff; text-align:center; padding-top:20%;">Stream not ready. Try another link.</div>';
            return;
        }

        modalArtPlayerInstance = new Artplayer({
            container: '#artplayer-tma',
            url: url,
            type: 'm3u8',
            poster: poster || '',
            volume: 0.9,
            autoplay: true,
            pip: true,
            setting: true,
            fullscreen: true,
            fullscreenWeb: true,
            theme: '#6366f1',
            quality: qualityList.length > 1 ? qualityList : [],
            moreVideoAttr: {
                crossOrigin: 'anonymous',
                preload: 'auto',
                playsinline: 'true'
            },
            customType: {
                m3u8: function (video, m3u8Url, art) {
                    if (Hls.isSupported()) {
                        if (art.hls) {
                            try { art.hls.destroy(); } catch (e) {}
                        }
                        const hls = new Hls({
                            enableWorker: true,
                            manifestLoadingTimeOut: 20000,
                            levelLoadingTimeOut: 20000
                        });
                        hls.loadSource(m3u8Url);
                        hls.attachMedia(video);
                        art.hls = hls;

                        hls.on(Hls.Events.MANIFEST_PARSED, () => {
                            video.play().catch(() => {});
                        });

                        art.on('destroy', () => {
                            try { hls.destroy(); } catch (e) {}
                        });
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = m3u8Url;
                    }
                }
            }
        });

        modalArtPlayerInstance.on('restart', (newUrl) => {
            if (modalArtPlayerInstance.hls) {
                modalArtPlayerInstance.hls.loadSource(newUrl);
                modalArtPlayerInstance.hls.startLoad();
            }
        });
    }

    function closeModal() {
        triggerHaptic('light');
        if (modalArtPlayerInstance) {
            try { modalArtPlayerInstance.destroy(false); } catch (e) {}
            modalArtPlayerInstance = null;
        }
        playerModal.style.display = 'none';
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
    // Preload and render videos immediately on startup with fresh cache-busted fetch
    loadHomeFeed();
    loadViralVideos('trending');
});
