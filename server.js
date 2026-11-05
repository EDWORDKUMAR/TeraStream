const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
});

const teraboxService = require('./services/teraboxService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Health Check Endpoint (For Render Keep-Alive / Cron Monitoring)
 */
app.get('/api/health', (req, res) => {
    return res.status(200).json({
        status: 'ok',
        service: 'TeraStream',
        uptime_seconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// History persistence
const HISTORY_FILE = path.join(__dirname, 'history.json');
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        }
    } catch (e) {}
    return [];
}

function saveHistory(item) {
    try {
        let history = loadHistory();
        history = history.filter(h => h.id !== item.id && h.name !== item.name);
        history.unshift({
            ...item,
            playedAt: new Date().toISOString()
        });
        if (history.length > 30) history = history.slice(0, 30);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
        console.error('Failed to save history:', e.message);
    }
}

// Collection persistence & auto-indexing
const COLLECTION_FILE = path.join(__dirname, 'data', 'collection.json');
function loadCollection() {
    try {
        if (fs.existsSync(COLLECTION_FILE)) {
            return JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf-8'));
        }
    } catch (e) {}
    return [];
}

function saveToCollection(videoItem, originalUrl) {
    try {
        let collection = loadCollection();
        if (collection.some(c => c.title === videoItem.name || c.id === videoItem.id)) return;
        collection.unshift({
            id: 'col_' + Date.now(),
            title: videoItem.name,
            category: 'trending',
            url: originalUrl,
            thumbnail: videoItem.thumbnail || videoItem.raw_thumbnail || 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&q=80',
            size_formatted: videoItem.size_formatted,
            duration: videoItem.duration || 'Video',
            quality: videoItem.quality || 'HD',
            views: (Math.floor(Math.random() * 40) + 15) + '.' + Math.floor(Math.random() * 9) + 'K',
            badge: '🔥 Trending',
            addedAt: new Date().toISOString()
        });
        if (collection.length > 60) collection = collection.slice(0, 60);
        fs.writeFileSync(COLLECTION_FILE, JSON.stringify(collection, null, 2));
    } catch (e) {
        console.error('Failed to save collection:', e.message);
    }
}

/**
 * Public REST API: GET /api/collection?category=...
 * Synchronized with TMA Admin Panel curated videos
 */
app.get('/api/collection', (req, res) => {
    const category = req.query.category || 'all';
    let list = loadTmaVideos();
    if (category !== 'all') {
        list = list.filter(item => item.category === category);
    }
    return res.json({
        status: 'success',
        category,
        total: list.length,
        items: list
    });
});

// TMA Videos Persistence & Admin Management
const TMA_VIDEOS_FILE = path.join(__dirname, 'data', 'tma_videos.json');
const ADMIN_SECRET = process.env.ADMIN_KEY || 'Admin@9001';

// In-Memory Fast Cache (immune to disk I/O race conditions)
let tmaVideosCache = null;

// Ensure data folder exists
try {
    fs.mkdirSync(path.dirname(TMA_VIDEOS_FILE), { recursive: true });
} catch (e) {}

function loadTmaVideos() {
    if (Array.isArray(tmaVideosCache)) {
        return [...tmaVideosCache];
    }
    try {
        if (fs.existsSync(TMA_VIDEOS_FILE)) {
            const raw = fs.readFileSync(TMA_VIDEOS_FILE, 'utf-8').trim();
            if (raw) {
                tmaVideosCache = JSON.parse(raw);
                return [...tmaVideosCache];
            }
        }
    } catch (e) {
        console.error('Failed to load TMA videos from disk:', e.message);
    }
    tmaVideosCache = [];
    return [];
}

async function syncToCloudStorage(videos) {
    // 1. GitHub Auto-Commit (Syncs directly to user repo so Render never loses data across redeploys)
    const ghToken = process.env.GITHUB_TOKEN;
    const ghRepo = process.env.GITHUB_REPO; // format: "username/repository"
    if (ghToken && ghRepo) {
        try {
            const targetPath = 'data/tma_videos.json';
            let sha = null;
            try {
                const getRes = await axios.get(`https://api.github.com/repos/${ghRepo}/contents/${targetPath}`, {
                    headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.v3+json' },
                    timeout: 5000
                });
                sha = getRes.data?.sha;
            } catch (e) {
                // file might not exist in repo yet
            }

            await axios.put(`https://api.github.com/repos/${ghRepo}/contents/${targetPath}`, {
                message: `Auto-sync: update TMA videos [${videos.length} items]`,
                content: Buffer.from(JSON.stringify(videos, null, 2)).toString('base64'),
                sha: sha || undefined
            }, {
                headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.v3+json' },
                timeout: 8000
            });
            console.log(`[Auto-Sync] Saved ${videos.length} videos to GitHub repo (${ghRepo})!`);
        } catch (err) {
            console.error('[Auto-Sync GitHub Error]:', err.response?.data?.message || err.message);
        }
    }

    // 2. Upstash Redis / REST KV (if configured in .env)
    const kvUrl = process.env.UPSTASH_REDIS_REST_URL;
    const kvToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (kvUrl && kvToken) {
        try {
            await axios.post(`${kvUrl}/set/tma_videos`, JSON.stringify(videos), {
                headers: { Authorization: `Bearer ${kvToken}` },
                timeout: 5000
            });
            console.log(`[Upstash Redis] Synced ${videos.length} videos to cloud KV store.`);
        } catch (e) {
            console.error('[Upstash Redis Error]:', e.message);
        }
    }
}

function saveTmaVideos(videos) {
    tmaVideosCache = Array.isArray(videos) ? [...videos] : [];
    try {
        fs.mkdirSync(path.dirname(TMA_VIDEOS_FILE), { recursive: true });
        fs.writeFileSync(TMA_VIDEOS_FILE, JSON.stringify(tmaVideosCache, null, 2));
    } catch (e) {
        console.error('Failed to save TMA videos to disk:', e.message);
    }
    // Async cloud backup
    syncToCloudStorage(tmaVideosCache).catch(() => {});
}

// Initial boot load
loadTmaVideos();

/**
 * TMA Public API: GET /api/tma/videos?category=trending|latest|popular|all
 * Zero-cache response to guarantee instant updates in TMA
 */
app.get('/api/tma/videos', (req, res) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    const category = req.query.category || 'all';
    let list = loadTmaVideos();
    if (category !== 'all') {
        list = list.filter(item => item.category === category);
    }
    return res.json({
        status: 'success',
        category,
        total: list.length,
        items: list
    });
});

/**
 * Adsgram / TMA S2S Reward Callback Webhook
 */
app.all('/api/tma/reward', (req, res) => {
    return res.status(200).json({ status: 'ok', rewarded: true });
});

/**
 * TMA Admin API: Check Auth Middleware
 */
function verifyAdmin(req, res, next) {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    const key = req.headers['x-admin-key'] || req.query.adminKey || req.body?.adminKey;
    if (key !== ADMIN_SECRET) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Invalid Admin Key'
        });
    }
    next();
}

/**
 * TMA Admin API: GET /api/tma/admin/stats
 */
app.get('/api/tma/admin/stats', verifyAdmin, (req, res) => {
    const list = loadTmaVideos();
    const stats = {
        total: list.length,
        trending: list.filter(v => v.category === 'trending').length,
        latest: list.filter(v => v.category === 'latest').length,
        popular: list.filter(v => v.category === 'popular').length
    };
    return res.json({
        status: 'success',
        stats,
        items: list
    });
});

/**
 * TMA Admin API: POST /api/tma/admin/add
 * Body: { url, category: 'trending' | 'latest' | 'popular', customTitle }
 */
app.post('/api/tma/admin/add', verifyAdmin, async (req, res) => {
    try {
        const { url, category = 'trending', customTitle } = req.body;
        if (!url) {
            return res.status(400).json({ status: 'error', message: 'URL is required' });
        }

        const validCategories = ['trending', 'latest', 'popular'];
        const chosenCategory = validCategories.includes(category) ? category : 'trending';

        console.log(`[TMA Admin] Fetching TeraBox details for: ${url} into category: ${chosenCategory}`);
        const result = await teraboxService.getShareDetails(url);

        if (!result.list || result.list.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No valid files found in this link' });
        }

        const currentVideos = loadTmaVideos();
        const playableVideos = result.list.filter(f => f.type === 'video');

        if (playableVideos.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No video files found in this link or folder.' });
        }

        const isFolder = playableVideos.length > 1 || result.total_folders > 0;
        const addedItems = [];

        for (const file of playableVideos) {
            const videoId = 'tma_' + (file.fs_id || Date.now() + '_' + Math.random().toString(36).substring(2, 6));
            
            // Check if already exists in TMA collection
            const exists = currentVideos.some(v => v.id === videoId || (v.url === url && v.title === file.name));
            if (!exists) {
                const badge = chosenCategory === 'trending' ? '🔥 Trending' : (chosenCategory === 'popular' ? '⭐ Popular' : '🆕 Latest');
                const newItem = {
                    id: videoId,
                    fs_id: file.fs_id,
                    title: customTitle && playableVideos.length === 1 ? customTitle : file.name,
                    category: chosenCategory,
                    url: url,
                    file_path: file.file_path,
                    thumbnail: file.raw_thumbnail || file.thumbnail || 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&q=80',
                    size_formatted: file.size_formatted,
                    duration: file.duration || 'Video',
                    quality: file.quality || 'HD',
                    views: `${(Math.floor(Math.random() * 30) + 10)}.${Math.floor(Math.random() * 9)}K`,
                    badge: badge,
                    isFolder: isFolder,
                    folderName: isFolder ? (file.file_path ? file.file_path.split('/')[1] : 'Folder') : '',
                    fast_stream_url: file.fast_stream_url,
                    stream_url: file.stream_url,
                    addedAt: new Date().toISOString()
                };
                currentVideos.unshift(newItem);
                addedItems.push(newItem);
            }
        }

        saveTmaVideos(currentVideos);

        return res.json({
            status: 'success',
            message: `Successfully added ${addedItems.length} video(s) to ${chosenCategory} tab!`,
            addedCount: addedItems.length,
            isFolder: isFolder,
            items: addedItems
        });
    } catch (error) {
        console.error('[TMA Admin Add Error]:', error.message);
        return res.status(500).json({ status: 'error', message: error.message || 'Failed to add video link' });
    }
});

/**
 * TMA Admin API: DELETE /api/tma/admin/video/:id
 */
app.delete('/api/tma/admin/video/:id', verifyAdmin, (req, res) => {
    try {
        const videoId = req.params.id;
        let currentVideos = loadTmaVideos();
        const initialCount = currentVideos.length;
        currentVideos = currentVideos.filter(v => v.id !== videoId);

        if (currentVideos.length === initialCount) {
            return res.status(404).json({ status: 'error', message: 'Video not found' });
        }

        saveTmaVideos(currentVideos);
        return res.json({
            status: 'success',
            message: 'Video deleted successfully'
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
});

/**
 * TMA Admin API: POST /api/tma/admin/clear-all
 * Clear all videos from catalog in one click
 */
app.post('/api/tma/admin/clear-all', verifyAdmin, (req, res) => {
    try {
        saveTmaVideos([]);
        return res.json({
            status: 'success',
            message: 'All videos cleared successfully'
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
});

/**
 * TMA Admin API: GET /api/tma/admin/export
 * Download tma_videos.json directly to commit to GitHub or save as backup
 */
app.get('/api/tma/admin/export', verifyAdmin, (req, res) => {
    const list = loadTmaVideos();
    res.setHeader('Content-disposition', 'attachment; filename=tma_videos.json');
    res.setHeader('Content-type', 'application/json');
    return res.send(JSON.stringify(list, null, 2));
});

/**
 * TMA Admin API: POST /api/tma/admin/restore
 * Restore videos from an uploaded JSON array
 */
app.post('/api/tma/admin/restore', verifyAdmin, (req, res) => {
    try {
        const { videos } = req.body;
        if (!Array.isArray(videos)) {
            return res.status(400).json({ status: 'error', message: 'Invalid payload: videos must be an array' });
        }
        saveTmaVideos(videos);
        return res.json({
            status: 'success',
            message: `Successfully restored ${videos.length} videos!`,
            count: videos.length
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * TMA Static UI Routes
 */
app.use('/tma', express.static(path.join(__dirname, 'public', 'tma')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

app.get('/tma', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tma', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

/**
 * Public REST API: GET /api/categories
 */
app.get('/api/categories', (req, res) => {
    return res.json({
        status: 'success',
        categories: [
            { id: 'all', name: 'All Videos', icon: '🌟' },
            { id: 'trending', name: '🔥 Trending', icon: '🔥' },
            { id: 'movies', name: '🎬 Movies & Series', icon: '🎬' },
            { id: 'anime', name: '🎌 Anime', icon: '🎌' },
            { id: 'viral', name: '⚡ Viral Clips', icon: '⚡' }
        ]
    });
});

/**
 * Public REST API: GET /api/terabox?url=...&cookie=...
 */
app.get('/api/terabox', async (req, res) => {
    try {
        const url = req.query.url;
        const cookie = req.query.cookie || req.headers['x-terabox-cookie'] || '';
        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing "url" query parameter. Example: /api/terabox?url=https://terabox.com/s/1...'
            });
        }

        const result = await teraboxService.getShareDetails(url, cookie);
        return res.json({
            status: 'success',
            api: 'TeraBox Extraction API v1.0',
            has_cookie: result.has_cookie,
            surl: result.surl,
            total_files: result.total_files,
            total_folders: result.total_folders,
            files: result.list
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to extract TeraBox API details'
        });
    }
});

/**
 * Endpoint: POST /api/stream
 */
app.post('/api/stream', async (req, res) => {
    try {
        const { url, cookie } = req.body;
        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'URL is required. Please provide a valid TeraBox link.'
            });
        }

        console.log(`[API /api/stream] Resolving link: ${url}`);
        const result = await teraboxService.getShareDetails(url, cookie);

        if (result.list && result.list.length > 0) {
            saveHistory(result.list[0]);
        }

        return res.json(result);
    } catch (error) {
        console.error('[API /api/stream Error]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to extract video from link'
        });
    }
});

/**
 * Endpoint: POST /api/download
 */
app.post('/api/download', async (req, res) => {
    try {
        const { url, cookie } = req.body;
        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'URL is required.'
            });
        }

        const result = await teraboxService.getShareDetails(url, cookie);
        return res.json(result);
    } catch (error) {
        console.error('[API /api/download Error]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to generate download link'
        });
    }
});

/**
 * Handler for M3U8 streaming proxy
 */
async function handleStreamProxy(req, res) {
    const streamUrl = req.query.url;
    const referer = req.query.referer || 'https://www.terabox.app/';
    const cookie = req.query.cookie || teraboxService.cookie || '';

    if (!streamUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const headers = {
            'User-Agent': teraboxService.defaultHeaders['User-Agent'],
            'Referer': referer
        };
        if (cookie) {
            headers['Cookie'] = teraboxService.formatCookie(cookie);
        }

        const upstream = await axios.get(streamUrl, {
            headers,
            httpsAgent,
            timeout: 12000,
            responseType: 'text'
        });

        let rawM3u8 = upstream.data;
        let activeCookie = cookie;

        if (typeof rawM3u8 === 'string' && rawM3u8.trim().startsWith('{')) {
            console.warn('[Proxy Stream Upstream Warning]:', rawM3u8);
            return res.status(502).json({
                status: 'error',
                message: 'Upstream stream manifest not ready'
            });
        }

        // 🚀 AUTO-UPGRADE TO FULL VIDEO: If TeraBox sent only 30s preview (<= 3 segments), auto-upgrade with verified accounts
        const segCount = (typeof rawM3u8 === 'string') ? (rawM3u8.match(/#EXTINF:/g) || []).length : 0;
        if (segCount > 0 && segCount <= 3 && teraboxService.cookiePool && teraboxService.cookiePool.length > 0) {
            console.log(`[Proxy Stream] Received ${segCount} segments preview. Auto-upgrading to FULL video stream with verified pool...`);
            for (const altCookie of teraboxService.cookiePool) {
                if (altCookie === activeCookie) continue;
                try {
                    const altHeaders = {
                        'User-Agent': teraboxService.defaultHeaders['User-Agent'],
                        'Referer': referer,
                        'Cookie': teraboxService.formatCookie(altCookie)
                    };
                    const altResp = await axios.get(streamUrl, {
                        headers: altHeaders,
                        httpsAgent,
                        timeout: 8000,
                        responseType: 'text'
                    });
                    if (typeof altResp.data === 'string' && altResp.data.includes('#EXTINF:')) {
                        const altSegCount = (altResp.data.match(/#EXTINF:/g) || []).length;
                        if (altSegCount > segCount) {
                            console.log(`[Proxy Stream] Successfully unlocked FULL VIDEO (${altSegCount} segments)!`);
                            rawM3u8 = altResp.data;
                            activeCookie = altCookie;
                            break;
                        }
                    }
                } catch (e) {}
            }
        }

        const rewrittenM3u8 = teraboxService.rewriteM3u8(rawM3u8, streamUrl, referer, activeCookie);

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(rewrittenM3u8);
    } catch (error) {
        console.error('[Proxy Stream Error]:', error.message);
        return res.status(502).send('Error proxying M3U8 manifest');
    }
}

app.get('/api/proxy/stream', handleStreamProxy);
app.get('/api/proxy/stream.m3u8', handleStreamProxy);

/**
 * Handler for TS segment proxy
 */
async function handleSegmentProxy(req, res) {
    const segmentUrl = req.query.url;
    const referer = req.query.referer || 'https://www.terabox.app/';
    const cookie = req.query.cookie || teraboxService.cookie || '';

    if (!segmentUrl) {
        return res.status(400).send('Missing segment url');
    }

    try {
        const headers = {
            'User-Agent': teraboxService.defaultHeaders['User-Agent'],
            'Referer': referer
        };
        if (cookie) {
            headers['Cookie'] = teraboxService.formatCookie(cookie);
        }

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const upstream = await axios.get(segmentUrl, {
            headers,
            httpsAgent,
            responseType: 'stream',
            timeout: 25000,
            validateStatus: status => status >= 200 && status < 400
        });

        res.status(upstream.status);
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        if (upstream.headers['content-length']) {
            res.setHeader('Content-Length', upstream.headers['content-length']);
        }
        if (upstream.headers['content-range']) {
            res.setHeader('Content-Range', upstream.headers['content-range']);
        }

        upstream.data.pipe(res);
    } catch (error) {
        console.error('[Proxy Segment Error]:', error.message);
        return res.status(502).send('Error proxying video segment');
    }
}

app.get('/api/proxy/segment', handleSegmentProxy);
app.get('/api/proxy/segment.ts', handleSegmentProxy);

/**
 * Endpoint: GET /api/proxy/thumbnail
 */
app.get('/api/proxy/thumbnail', async (req, res) => {
    const thumbUrl = req.query.url;
    const referer = req.query.referer || 'https://www.terabox.app/';
    if (!thumbUrl) {
        return res.status(400).send('Missing url');
    }

    try {
        const upstream = await axios.get(thumbUrl, {
            headers: {
                'User-Agent': teraboxService.defaultHeaders['User-Agent'],
                'Referer': referer
            },
            httpsAgent,
            responseType: 'stream',
            timeout: 8000
        });

        res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=604800');

        upstream.data.pipe(res);
    } catch (error) {
        return res.status(404).send('Thumbnail unavailable');
    }
});

/**
 * Endpoint: GET /api/history
 */
app.get('/api/history', (req, res) => {
    res.json({
        status: 'success',
        history: loadHistory()
    });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  🚀 iTeraPlay Clone Server Running!`);
    console.log(`  🔗 Local Web Player: http://localhost:${PORT}`);
    console.log(`  📡 TeraBox REST API: http://localhost:${PORT}/api/terabox?url=...`);
    console.log(`======================================================\n`);

    // ⏰ Render Auto-Keepalive: prevents 15-minute free tier deep sleep
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
    if (RENDER_EXTERNAL_URL) {
        const PING_INTERVAL = 8 * 60 * 1000; // 8 minutes
        setInterval(async () => {
            try {
                await axios.get(`${RENDER_EXTERNAL_URL}/api/health`, { timeout: 10000 });
                console.log(`[KeepAlive] Pinged ${RENDER_EXTERNAL_URL}/api/health (Instance awake)`);
            } catch (e) {
                console.warn('[KeepAlive] Self-ping error:', e.message);
            }
        }, PING_INTERVAL);
        console.log(`  ⏰ Render Auto-KeepAlive scheduled every 8 mins for: ${RENDER_EXTERNAL_URL}\n`);
    }
});
