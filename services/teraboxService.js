require('dotenv').config();
const axios = require('axios');
const https = require('https');
const { URL } = require('url');

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
});

class TeraboxService {
    constructor() {
        this.cookiePool = this.parseCookiePool(process.env.TERABOX_COOKIE || '');
        this.currentCookieIndex = 0;
        this.defaultHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
        };
    }

    parseCookiePool(rawString) {
        if (!rawString) return [];
        const rawTokens = rawString.split(/[\n,;]+/).map(t => t.trim()).filter(Boolean);
        const pool = rawTokens.map(t => this.formatCookie(t)).filter(Boolean);
        console.log(`[TeraboxService] Initialized with ${pool.length} active ndus account token(s) in pool.`);
        return pool;
    }

    get cookie() {
        return this.getNextCookie();
    }

    getNextCookie() {
        if (!this.cookiePool || this.cookiePool.length === 0) return '';
        const cookie = this.cookiePool[this.currentCookieIndex];
        this.currentCookieIndex = (this.currentCookieIndex + 1) % this.cookiePool.length;
        return cookie;
    }

    formatCookie(cookieStr) {
        if (!cookieStr) return '';
        const trimmed = cookieStr.trim();
        if (trimmed.startsWith('ndus=')) return trimmed;
        if (trimmed.includes('=')) return trimmed;
        return `ndus=${trimmed}`;
    }

    extractSurl(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') return null;
        const cleanUrl = urlStr.trim();

        const sMatch = cleanUrl.match(/\/s\/(?:1)?([a-zA-Z0-9_-]+)/i);
        if (sMatch) return sMatch[1];

        const surlMatch = cleanUrl.match(/[?&]surl=([a-zA-Z0-9_-]+)/i);
        if (surlMatch) {
            let code = surlMatch[1];
            if (code.startsWith('1')) code = code.substring(1);
            return code;
        }

        if (/^[a-zA-Z0-9_-]{15,35}$/.test(cleanUrl)) {
            let code = cleanUrl;
            if (code.startsWith('1')) code = code.substring(1);
            return code;
        }

        return null;
    }

    formatSize(bytes) {
        const size = parseInt(bytes, 10);
        if (isNaN(size) || size === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(size) / Math.log(k));
        return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(seconds) {
        if (!seconds) return '00:00';
        if (typeof seconds === 'string' && seconds.includes(':')) return seconds;
        const s = parseInt(seconds, 10);
        if (isNaN(s) || s <= 0) return '00:00';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    isVideoFile(filename) {
        if (!filename) return false;
        const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts'];
        return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    }

    async resolveViaInitialState(inputUrl, customCookie = '') {
        const activeCookie = this.formatCookie(customCookie || this.cookie);
        const headers = { ...this.defaultHeaders };
        if (activeCookie) {
            headers['Cookie'] = activeCookie;
        }

        let targetUrl = inputUrl.trim();
        // Normalize flaky domains to 1024terabox.com to eliminate TLS ECONNRESET
        targetUrl = targetUrl.replace(/teraboxapp\.com/gi, '1024terabox.com')
                             .replace(/terabox\.app/gi, '1024terabox.com');
        if (!targetUrl.startsWith('http')) {
            targetUrl = `https://1024terabox.com/s/${targetUrl}`;
        }

        console.log(`[TeraboxService] Fetching initial share page: ${targetUrl} (Cookie: ${activeCookie ? 'Yes' : 'No'})`);
        const response = await axios.get(targetUrl, {
            headers,
            httpsAgent,
            maxRedirects: 5,
            timeout: 15000,
            validateStatus: status => status >= 200 && status < 400
        });

        const finalUrl = response.request?.res?.responseUrl || targetUrl;
        const parsedFinal = new URL(finalUrl);
        const domain = parsedFinal.hostname;
        const html = typeof response.data === 'string' ? response.data : '';

        const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s);
        if (!stateMatch) {
            throw new Error('__INITIAL_STATE__ not found in page HTML.');
        }

        const state = JSON.parse(stateMatch[1]);
        const pinia = state.pinia || {};
        const share = pinia.share || state.share || {};
        const shareInfo = share.shareInfo || {};

        const shareid = shareInfo.shareid;
        const uk = shareInfo.uk;
        const sign = shareInfo.sign;
        const timestamp = shareInfo.timestamp;
        const surl = shareInfo.surl || this.extractSurl(finalUrl);
        const rootFileInfo = shareInfo.fileInfo || {};

        if (!shareid || !uk) {
            throw new Error('Failed to extract shareid/uk from TeraBox state.');
        }

        let files = [];
        if (String(rootFileInfo.isdir) === '1') {
            const dirPath = rootFileInfo.path || '/';
            console.log(`[TeraboxService] Share is a directory (${dirPath}). Fetching files inside directory...`);

            const listUrl = `https://${domain}/share/list`;
            const listResp = await axios.get(listUrl, {
                params: {
                    app_id: '250528',
                    web: '1',
                    channel: 'dubox',
                    clienttype: '0',
                    shorturl: surl,
                    dir: dirPath,
                    page: '1',
                    num: '100',
                    by: 'name',
                    order: 'asc',
                    site_referer: finalUrl
                },
                headers: {
                    ...this.defaultHeaders,
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': finalUrl
                },
                httpsAgent,
                timeout: 12000
            });

            if (listResp.data && listResp.data.errno === 0 && Array.isArray(listResp.data.list)) {
                files = listResp.data.list;
            } else {
                files = [rootFileInfo];
            }
        } else {
            files = [rootFileInfo];
        }

        return {
            domain,
            finalUrl,
            shareid,
            uk,
            sign,
            timestamp,
            surl,
            cookie: activeCookie,
            items: files
        };
    }

    async getShareDetails(urlStr, customCookie = '') {
        const surl = this.extractSurl(urlStr);
        if (!surl) {
            throw new Error('Invalid TeraBox link format. Link must contain /s/ or surl=');
        }

        const rawResult = await this.resolveViaInitialState(urlStr, customCookie);
        const { domain, finalUrl, shareid, uk, sign, timestamp, cookie, items } = rawResult;

        const playableFiles = [];
        const folderItems = [];

        items.forEach((item, idx) => {
            const isDir = String(item.isdir) === '1' || parseInt(item.size, 10) === 0;
            const fileName = item.server_filename || item.name || `Item_${idx + 1}`;
            const sizeBytes = parseInt(item.size || 0, 10);
            const sizeFormatted = this.formatSize(sizeBytes);
            const thumbnail = item.thumbs?.url3 || item.thumbs?.url2 || item.thumbs?.url1 || item.thumbnail || '';
            const fsId = item.fs_id || item.fid;

            if (isDir) {
                folderItems.push({
                    id: fsId || `${surl}_dir_${idx}`,
                    fs_id: fsId,
                    name: fileName,
                    file_path: item.path || `/${fileName}`,
                    size: 0,
                    size_formatted: 'Folder',
                    type: 'folder',
                    duration: '',
                    quality: 'Folder',
                    thumbnail: '',
                    fast_stream_url: {},
                    stream_url: ''
                });
            } else {
                const isVideo = this.isVideoFile(fileName) || item.category === 1 || item.category === '1';
                const fastStreamUrl = {};

                if (fsId && shareid && uk && sign && timestamp) {
                    const baseStreamUrl = `https://${domain}/share/streaming?app_id=250528&channel=dubox&clienttype=0&web=1&uk=${uk}&shareid=${shareid}&fid=${fsId}&sign=${sign}&timestamp=${timestamp}&preview=0&freevip=1`;
                    
                    const cookieParam = cookie ? `&cookie=${encodeURIComponent(cookie)}` : '';
                    fastStreamUrl['360p'] = `/api/proxy/stream.m3u8?url=${encodeURIComponent(baseStreamUrl + '&type=M3U8_AUTO_360')}&referer=${encodeURIComponent(finalUrl)}${cookieParam}`;
                    fastStreamUrl['480p'] = `/api/proxy/stream.m3u8?url=${encodeURIComponent(baseStreamUrl + '&type=M3U8_AUTO_480')}&referer=${encodeURIComponent(finalUrl)}${cookieParam}`;
                    fastStreamUrl['720p'] = `/api/proxy/stream.m3u8?url=${encodeURIComponent(baseStreamUrl + '&type=M3U8_AUTO_720')}&referer=${encodeURIComponent(finalUrl)}${cookieParam}`;
                    fastStreamUrl['1080p'] = `/api/proxy/stream.m3u8?url=${encodeURIComponent(baseStreamUrl + '&type=M3U8_AUTO_1080')}&referer=${encodeURIComponent(finalUrl)}${cookieParam}`;
                }

                const chosenStream = fastStreamUrl['360p'] || fastStreamUrl['480p'] || '';

                playableFiles.push({
                    id: fsId || `${surl}_file_${idx}`,
                    fs_id: fsId,
                    name: fileName,
                    file_path: item.path || `/${fileName}`,
                    size: sizeBytes,
                    size_formatted: sizeFormatted,
                    type: isVideo ? 'video' : 'file',
                    duration: this.formatDuration(item.duration || 0),
                    quality: 'HD',
                    thumbnail: thumbnail ? `/api/proxy/thumbnail?url=${encodeURIComponent(thumbnail)}&referer=${encodeURIComponent(finalUrl)}` : '',
                    raw_thumbnail: thumbnail,
                    fast_stream_url: fastStreamUrl,
                    stream_url: chosenStream,
                    fast_dlink: chosenStream,
                    normal_dlink: chosenStream,
                    download_link: chosenStream,
                    has_cookie: Boolean(cookie),
                    subtitle_url: null
                });
            }
        });

        const finalList = [...playableFiles, ...folderItems];

        if (finalList.length === 0) {
            throw new Error('No files found in this TeraBox share link.');
        }

        return {
            status: 'success',
            has_cookie: Boolean(cookie),
            total_files: playableFiles.length,
            total_folders: folderItems.length,
            surl: surl,
            list: finalList
        };
    }

    rewriteM3u8(m3u8Content, baseUrl, referer, cookie = '') {
        const lines = m3u8Content.split(/\r?\n/);
        const outputLines = [];
        const cookieParam = cookie ? `&cookie=${encodeURIComponent(cookie)}` : '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                outputLines.push(line);
                continue;
            }

            if (line.startsWith('#')) {
                if (line.includes('URI="')) {
                    const rewrittenTag = line.replace(/URI="([^"]+)"/, (match, uri) => {
                        const absoluteUri = this.resolveUrl(uri, baseUrl);
                        return `URI="/api/proxy/segment.ts?url=${encodeURIComponent(absoluteUri)}&referer=${encodeURIComponent(referer || '')}${cookieParam}"`;
                    });
                    outputLines.push(rewrittenTag);
                } else {
                    outputLines.push(line);
                }
            } else {
                const absoluteSegmentUrl = this.resolveUrl(line, baseUrl);
                outputLines.push(`/api/proxy/segment.ts?url=${encodeURIComponent(absoluteSegmentUrl)}&referer=${encodeURIComponent(referer || '')}${cookieParam}`);
            }
        }

        return outputLines.join('\n');
    }

    resolveUrl(relative, base) {
        try {
            return new URL(relative, base).href;
        } catch {
            return relative;
        }
    }
}

module.exports = new TeraboxService();
