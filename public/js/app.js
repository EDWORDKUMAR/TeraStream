// iTeraPlay Clone - Core Frontend Application
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const urlInput = document.getElementById('url-input');
    const playBtn = document.getElementById('play-btn');
    const downloadBtn = document.getElementById('download-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const errorBox = document.getElementById('error-box');
    const errorMessage = document.getElementById('error-message');
    const loadingBox = document.getElementById('loading-box');
    const playerCard = document.getElementById('player-card');
    const filesCard = document.getElementById('files-card');
    const filesList = document.getElementById('files-list');
    const filesCount = document.getElementById('files-count');
    const historyCard = document.getElementById('history-card');
    const historyGrid = document.getElementById('history-grid');

    // Cookie Box Elements
    const cookieModalBtn = document.getElementById('cookie-modal-btn');
    const cookieStatusBadge = document.getElementById('cookie-status-badge');
    const cookieBox = document.getElementById('cookie-box');
    const closeCookieBox = document.getElementById('close-cookie-box');
    const cookieInput = document.getElementById('cookie-input');
    const saveCookieBtn = document.getElementById('save-cookie-btn');
    const videoLimitBadge = document.getElementById('video-limit-badge');

    // Video details elements
    const videoTitle = document.getElementById('video-title');
    const videoSize = document.getElementById('video-size');
    const videoDuration = document.getElementById('video-duration');
    const videoQuality = document.getElementById('video-quality');
    const fastDownloadBtn = document.getElementById('fast-download-btn');
    const standardDownloadBtn = document.getElementById('standard-download-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');

    let artPlayerInstance = null;
    let currentFiles = [];
    let activeFile = null;

    // --- Cookie Management (Safe check) ---
    let userCookie = localStorage.getItem('terabox_ndus_cookie') || '';
    if (userCookie && cookieInput) {
        cookieInput.value = userCookie;
        if (cookieStatusBadge) cookieStatusBadge.textContent = 'Account Active ✅';
    }

    if (cookieModalBtn && cookieBox) {
        cookieModalBtn.addEventListener('click', () => {
            cookieBox.style.display = cookieBox.style.display === 'none' ? 'block' : 'none';
            if (cookieBox.style.display === 'block' && cookieInput) {
                cookieInput.focus();
            }
        });
    }

    if (closeCookieBox && cookieBox) {
        closeCookieBox.addEventListener('click', () => {
            cookieBox.style.display = 'none';
        });
    }

    if (videoLimitBadge && cookieBox) {
        videoLimitBadge.addEventListener('click', () => {
            cookieBox.style.display = 'block';
            if (cookieInput) cookieInput.focus();
            cookieBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    if (saveCookieBtn && cookieInput) {
        saveCookieBtn.addEventListener('click', () => {
            const val = cookieInput.value.trim();
            userCookie = val;
            localStorage.setItem('terabox_ndus_cookie', val);
            if (val) {
                if (cookieStatusBadge) cookieStatusBadge.textContent = 'Account Active ✅';
                alert('TeraBox cookie saved! Now all videos will stream in full length without 30s limit.');
                if (cookieBox) cookieBox.style.display = 'none';
                if (activeFile && urlInput.value) {
                    handleProcess('stream');
                }
            } else {
                if (cookieStatusBadge) cookieStatusBadge.textContent = 'Unlock Full Video';
                alert('Cookie cleared.');
            }
        });
    }

    // --- Theme Management ---
    const savedTheme = localStorage.getItem('iteraplay_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('iteraplay_theme', newTheme);
        updateThemeIcon(newTheme);
    });

    function updateThemeIcon(theme) {
        themeToggle.innerHTML = theme === 'light' ? '🌙' : '☀️';
    }

    // --- Paste Button ---
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                urlInput.focus();
            }
        } catch (e) {
            console.warn('Clipboard read failed:', e);
        }
    });

    // --- UI Helpers ---
    function showError(msg) {
        errorMessage.textContent = msg;
        errorBox.style.display = 'flex';
        loadingBox.style.display = 'none';
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideError() {
        errorBox.style.display = 'none';
    }

    function showLoading() {
        hideError();
        playerCard.style.display = 'none';
        filesCard.style.display = 'none';
        loadingBox.style.display = 'flex';
        playBtn.disabled = true;
        downloadBtn.disabled = true;
        loadingBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideLoading() {
        loadingBox.style.display = 'none';
        playBtn.disabled = false;
        downloadBtn.disabled = false;
    }

    // --- Action Handlers ---
    playBtn.addEventListener('click', () => handleProcess('stream'));
    downloadBtn.addEventListener('click', () => handleProcess('download'));

    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleProcess('stream');
        }
    });

    async function handleProcess(mode) {
        const url = urlInput.value.trim();
        if (!url) {
            showError('Please enter a valid TeraBox link.');
            return;
        }

        showLoading();

        try {
            const endpoint = mode === 'download' ? '/api/download' : '/api/stream';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    cookie: userCookie
                })
            });

            const data = await response.json();

            if (!response.ok || data.status === 'error') {
                throw new Error(data.message || 'Failed to process TeraBox link.');
            }

            if (!data.list || data.list.length === 0) {
                throw new Error('No accessible files found in this TeraBox link.');
            }

            currentFiles = data.list;
            hideLoading();

            // Render file list if multiple items
            if (currentFiles.length > 1) {
                renderFilesList(currentFiles);
            } else {
                filesCard.style.display = 'none';
            }

            // Pick the first playable video file
            const initialFile = currentFiles.find(f => f.type === 'video' && f.stream_url) || currentFiles[0];
            loadMediaItem(initialFile);

            // Refresh recent history
            loadHistory();

        } catch (error) {
            hideLoading();
            showError(error.message);
        }
    }

    // --- Media Player Initialization (ArtPlayer + HLS) ---
    function loadMediaItem(file) {
        activeFile = file;

        if (file.type === 'folder' || !file.stream_url) {
            showError(`"${file.name}" is a folder. Please select a video file from the list below.`);
            return;
        }

        hideError();

        // Populate info section
        videoTitle.textContent = file.name;
        videoSize.textContent = `💾 ${file.size_formatted}`;
        videoDuration.textContent = `⏱️ ${file.duration || 'Video'}`;
        videoQuality.textContent = `✨ ${file.quality || 'HD'}`;

        if (videoLimitBadge) {
            if (!userCookie && !file.has_cookie) {
                videoLimitBadge.style.display = 'inline-flex';
                videoLimitBadge.textContent = '⚡ 30s Preview: Click to Unlock Full';
            } else {
                videoLimitBadge.style.display = 'inline-flex';
                videoLimitBadge.style.background = 'rgba(16, 185, 129, 0.15)';
                videoLimitBadge.style.color = '#34d399';
                videoLimitBadge.textContent = '🌟 Full Video Unlocked';
            }
        }

        // Setup download buttons
        fastDownloadBtn.href = file.fast_dlink || file.download_link;
        fastDownloadBtn.target = '_blank';

        standardDownloadBtn.href = file.normal_dlink || file.download_link;
        standardDownloadBtn.target = '_blank';

        copyLinkBtn.onclick = () => {
            const linkToCopy = file.fast_dlink || file.download_link;
            navigator.clipboard.writeText(linkToCopy).then(() => {
                const originalText = copyLinkBtn.innerHTML;
                copyLinkBtn.innerHTML = '✅ Copied!';
                setTimeout(() => { copyLinkBtn.innerHTML = originalText; }, 2000);
            });
        };

        playerCard.style.display = 'block';
        playerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Build quality options for ArtPlayer
        let qualityList = [];
        let initialStreamUrl = file.stream_url;

        if (file.fast_stream_url && typeof file.fast_stream_url === 'object') {
            const qualities = Object.keys(file.fast_stream_url);
            if (qualities.length > 0) {
                const defaultQuality = '360p';
                qualityList = qualities.map(q => ({
                    html: q,
                    url: file.fast_stream_url[q],
                    default: q === defaultQuality
                }));

                const chosen = qualityList.find(q => q.default) || qualityList[0];
                initialStreamUrl = chosen.url;
            }
        }

        // Clean container and destroy previous player
        if (artPlayerInstance) {
            try { artPlayerInstance.destroy(false); } catch (e) {}
            artPlayerInstance = null;
        }

        const containerEl = document.getElementById('artplayer-container');
        containerEl.innerHTML = '';

        console.log('[ArtPlayer] Loading stream URL:', initialStreamUrl);

        // Initialize ArtPlayer
        artPlayerInstance = new Artplayer({
            container: '#artplayer-container',
            url: initialStreamUrl,
            type: 'm3u8',
            poster: file.thumbnail || '',
            volume: 0.8,
            isLive: false,
            muted: false,
            autoplay: false,
            pip: true,
            autoSize: false,
            autoMini: false,
            screenshot: true,
            setting: true,
            loop: false,
            flip: true,
            playbackRate: true,
            aspectRatio: true,
            fullscreen: true,
            fullscreenWeb: true,
            miniProgressBar: true,
            mutex: true,
            backdrop: true,
            playsInline: true,
            theme: '#3b82f6',
            lang: 'en',
            quality: qualityList.length > 1 ? qualityList : [],
            moreVideoAttr: {
                crossOrigin: 'anonymous',
                preload: 'auto',
                playsinline: 'true'
            },
            customType: {
                m3u8: function (video, url, art) {
                    if (Hls.isSupported()) {
                        if (art.hls) {
                            try { art.hls.destroy(); } catch (e) {}
                        }
                        const hls = new Hls({
                            debug: false,
                            enableWorker: true,
                            lowLatencyMode: false,
                            backBufferLength: 30,
                            maxBufferLength: 30,
                            maxMaxBufferLength: 60,
                            manifestLoadingTimeOut: 20000,
                            levelLoadingTimeOut: 20000,
                            fragLoadingTimeOut: 30000
                        });

                        hls.loadSource(url);
                        hls.attachMedia(video);
                        art.hls = hls;

                        hls.on(Hls.Events.MANIFEST_PARSED, () => {
                            console.log('✅ HLS Manifest Parsed successfully!');
                            video.play().catch(err => {
                                console.log('Autoplay was deferred, waiting for user click.');
                            });
                        });

                        hls.on(Hls.Events.ERROR, (event, data) => {
                            console.warn('⚠️ HLS Error Event:', data.details);
                            if (data.fatal) {
                                switch (data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                        console.warn('Network error, restarting load...');
                                        hls.startLoad();
                                        break;
                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                        console.warn('Media error, attempting recovery...');
                                        hls.recoverMediaError();
                                        break;
                                    default:
                                        console.error('Fatal HLS Error, destroying instance:', data);
                                        hls.destroy();
                                        break;
                                }
                            }
                        });

                        art.on('destroy', () => {
                            try { hls.destroy(); } catch (e) {}
                        });
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = url;
                    } else {
                        art.notice.show = 'Unsupported format in this browser: m3u8';
                    }
                }
            }
        });

        // Handle quality switching in ArtPlayer
        artPlayerInstance.on('restart', (url) => {
            console.log('[ArtPlayer] Switched quality stream URL:', url);
            if (artPlayerInstance.hls) {
                artPlayerInstance.hls.loadSource(url);
                artPlayerInstance.hls.startLoad();
            }
        });
    }

    // --- Files List Renderer ---
    function renderFilesList(files) {
        filesList.innerHTML = '';
        filesCard.style.display = 'block';
        if (filesCount) filesCount.textContent = files.length;

        files.forEach((file) => {
            const item = document.createElement('div');
            item.className = `file-item ${file === activeFile ? 'active' : ''}`;
            item.innerHTML = `
                <div class="file-left">
                    <div class="file-icon">${file.type === 'video' ? '🎬' : '📁'}</div>
                    <div class="file-meta">
                        <div class="file-name" title="${file.name}">${file.name}</div>
                        <div class="file-sub">${file.size_formatted} • ${file.duration || (file.type === 'video' ? 'Video' : 'Folder')}</div>
                    </div>
                </div>
                <button class="btn btn-secondary" style="height:34px; padding:0 0.75rem; font-size:0.8rem;">
                    ${file.type === 'video' ? '▶ Play' : '📁 Open'}
                </button>
            `;

            item.addEventListener('click', () => {
                document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                loadMediaItem(file);
            });

            filesList.appendChild(item);
        });
    }

    // --- History Loader ---
    async function loadHistory() {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            if (data.status === 'success' && data.history && data.history.length > 0) {
                historyCard.style.display = 'block';
                historyGrid.innerHTML = '';

                data.history.slice(0, 8).forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'history-item';
                    const thumbUrl = item.thumbnail || 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=400&q=80';
                    card.innerHTML = `
                        <img src="${thumbUrl}" class="history-thumb" alt="${item.name}" onerror="this.src='https://images.unsplash.com/photo-1536240478700-b869070f9279?w=400&q=80'">
                        <div class="history-details">
                            <div class="history-title" title="${item.name}">${item.name}</div>
                            <div class="history-info">
                                <span>${item.size_formatted || ''}</span>
                                <span>${item.duration || ''}</span>
                            </div>
                        </div>
                    `;

                    card.addEventListener('click', () => {
                        loadMediaItem(item);
                    });

                    historyGrid.appendChild(card);
                });
            } else {
                historyCard.style.display = 'none';
            }
        } catch (e) {
            console.warn('History load error:', e);
        }
    }

    // Initial load
    loadHistory();

    // --- Trending & Categories Video Collection ---
    const collectionGrid = document.getElementById('collection-grid');
    const categoryPills = document.querySelectorAll('.cat-pill');
    let activeCategory = 'all';

    async function loadCollection(category = 'all') {
        if (!collectionGrid) return;
        try {
            collectionGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Loading trending collection...</div>';
            const res = await fetch(`/api/collection?category=${encodeURIComponent(category)}`);
            const data = await res.json();

            if (data.status === 'success' && data.items && data.items.length > 0) {
                collectionGrid.innerHTML = '';
                data.items.forEach(video => {
                    const card = document.createElement('div');
                    card.className = 'collection-card';
                    card.innerHTML = `
                        <div class="collection-thumb-wrapper">
                            <img src="${video.thumbnail}" class="collection-thumb" alt="${video.title}" onerror="this.src='https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&q=80'">
                            <span class="collection-badge-overlay">${video.badge || '🔥 Top'}</span>
                            <span class="collection-duration-overlay">${video.duration || 'HD'}</span>
                            <div class="collection-play-overlay">
                                <div class="play-circle">▶</div>
                            </div>
                        </div>
                        <div class="collection-body">
                            <div class="collection-title" title="${video.title}">${video.title}</div>
                            <div class="collection-meta">
                                <span>👁️ ${video.views || '12K'} views</span>
                                <span>💾 ${video.size_formatted || 'HD'}</span>
                            </div>
                        </div>
                    `;

                    card.addEventListener('click', () => {
                        urlInput.value = video.url;
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        handleProcess('stream');
                    });

                    collectionGrid.appendChild(card);
                });
            } else {
                collectionGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">No videos found in this category.</div>';
            }
        } catch (e) {
            console.warn('Collection load error:', e);
            collectionGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Failed to load collection.</div>';
        }
    }

    // Category Filter Buttons
    categoryPills.forEach(pill => {
        pill.addEventListener('click', () => {
            categoryPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeCategory = pill.getAttribute('data-category');
            loadCollection(activeCategory);
        });
    });

    // Initial collection load
    loadCollection('all');

    // Check if query param ?url= was supplied
    const params = new URLSearchParams(window.location.search);
    const initialUrl = params.get('url') || params.get('id');
    if (initialUrl) {
        urlInput.value = initialUrl.startsWith('http') ? initialUrl : `https://terabox.com/s/${initialUrl}`;
        handleProcess('stream');
    }
});
