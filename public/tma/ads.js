/**
 * Pro Ad & Monetization Manager for Telegram Mini App
 * Official Monetag Rewarded Interstitial Integration (Zone ID: 12191197)
 * SDK: <script src="https://libtl.com/sdk.js" data-zone="12191197" data-sdk="show_12191197"></script>
 */

const AdConfig = {
    // ⚙️ Keep enabled to ensure ads run on streams & every download
    enabled: true,

    // Primary Provider: 'monetag' | 'adsgram' | 'custom'
    provider: 'monetag',

    // Monetag Rewarded Interstitial Configuration
    monetagZoneId: '12191197',
    monetagSdkFunction: 'show_12191197',
    monetagSdkUrl: 'https://libtl.com/sdk.js',

    // Optional Adsgram Block ID (fallback)
    adsgramBlockId: '54835',

    // Rewarded / Interstitial ad before video playback & on every download
    interstitialBeforePlay: true,
    interstitialOnEveryDownload: true,
    interstitialFrequencySeconds: 0, // 0 = trigger every time without skipping

    // Max timeout (ms) waiting for external ad network before falling back so app never freezes
    sdkTimeoutMs: 7500,

    // Banner ad slots
    bannerTopEnabled: false,
    bannerBottomEnabled: false,

    // Custom Banner HTML
    customBannerHtml: `
        <div style="background: linear-gradient(90deg, rgba(255,85,51,0.14), rgba(255,42,109,0.14)); border: 1px dashed rgba(255,85,51,0.35); border-radius: 12px; padding: 10px 12px; text-align: center; font-size: 0.75rem; color: #cbd5e1;">
            ⚡ <strong>Sponsored Cloud Bandwidth</strong> • High-Speed Direct Stream Active
        </div>
    `
};

class AdManager {
    constructor() {
        this.lastAdTime = 0;
        this.isInitialized = false;
        this.adsgramController = null;
        this.isAdCurrentlyShowing = false;
    }

    init() {
        if (!AdConfig.enabled) {
            console.log('[AdManager] Ads are currently disabled.');
            return;
        }

        this.isInitialized = true;
        this.ensureMonetagSdkLoaded();
        this.renderBanners();
        console.log(`[AdManager] Pro Monetization initialized (Provider: ${AdConfig.provider}, Zone: ${AdConfig.monetagZoneId})`);
    }

    /**
     * Dynamically ensures the Monetag SDK script is present in the DOM
     */
    ensureMonetagSdkLoaded() {
        if (typeof window[AdConfig.monetagSdkFunction] === 'function' || typeof window.show_12191197 === 'function') {
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            let existingScript = document.querySelector(`script[data-zone="${AdConfig.monetagZoneId}"]`);
            if (!existingScript) {
                existingScript = document.createElement('script');
                existingScript.src = AdConfig.monetagSdkUrl;
                existingScript.setAttribute('data-zone', AdConfig.monetagZoneId);
                existingScript.setAttribute('data-sdk', AdConfig.monetagSdkFunction);
                existingScript.async = true;
                document.head.appendChild(existingScript);
            }

            // Poll briefly for SDK function to attach to window
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                const fn = window[AdConfig.monetagSdkFunction] || window.show_12191197;
                if (typeof fn === 'function') {
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (attempts >= 15) { // 1.5s max wait for script load
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 100);
        });
    }

    renderBanners() {
        if (!AdConfig.enabled) return;

        const bannerTopContainer = document.getElementById('ad-banner-top');
        if (bannerTopContainer && AdConfig.bannerTopEnabled) {
            bannerTopContainer.innerHTML = AdConfig.customBannerHtml;
            bannerTopContainer.style.display = 'block';
        }
    }

    /**
     * Show Rewarded / Interstitial Ad before playing or downloading.
     * Guaranteed to show an ad on every download (when force = true) and resolve cleanly.
     * @param {Function|null} onComplete Callback when ad completes/dismisses
     * @param {Boolean} force If true, bypasses cooldown and guarantees ad execution (used for all downloads)
     * @param {String} contextLabel Optional label ('download' | 'stream' | 'midroll')
     */
    showVideoAd(onComplete = null, force = true, contextLabel = 'stream') {
        return new Promise(async (resolve) => {
            let settled = false;
            const proceed = () => {
                if (settled) return;
                settled = true;
                this.isAdCurrentlyShowing = false;
                if (typeof onComplete === 'function') {
                    try { onComplete(); } catch (e) { console.error('[AdManager] Callback error:', e); }
                }
                resolve();
            };

            if (!AdConfig.enabled) {
                proceed();
                return;
            }

            const now = Date.now();
            const elapsed = (now - this.lastAdTime) / 1000;

            if (!force && AdConfig.interstitialFrequencySeconds > 0 && elapsed < AdConfig.interstitialFrequencySeconds) {
                console.log(`[AdManager] Cooldown active (${Math.round(elapsed)}s < ${AdConfig.interstitialFrequencySeconds}s), skipping ad.`);
                proceed();
                return;
            }

            this.isAdCurrentlyShowing = true;

            // --- 1. MONETAG REWARDED INTERSTITIAL FLOW ---
            if (AdConfig.provider === 'monetag') {
                await this.ensureMonetagSdkLoaded();
                const sdkFn = window[AdConfig.monetagSdkFunction] || window.show_12191197;

                if (typeof sdkFn === 'function') {
                    console.log(`[AdManager] Triggering Monetag Ad (${contextLabel}, Zone: ${AdConfig.monetagZoneId})...`);
                    const startTime = Date.now();
                    try {
                        // Race SDK call against a timeout so a hung network request never locks the app
                        await Promise.race([
                            Promise.resolve(sdkFn()),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Monetag SDK timeout')), AdConfig.sdkTimeoutMs))
                        ]);
                        const durationMs = Date.now() - startTime;
                        this.lastAdTime = Date.now();
                        console.log(`[Monetag] Ad finished in ${durationMs}ms.`);

                        // If SDK resolved instantaneously (< 250ms) because of adblock or no-fill on a forced action, show fallback modal
                        if (force && durationMs < 250) {
                            console.log('[AdManager] Monetag returned instant no-fill; showing built-in sponsored interstitial.');
                            this.showCustomModalAd(proceed, contextLabel);
                            return;
                        }

                        proceed();
                        return;
                    } catch (err) {
                        console.warn('[Monetag] Ad error or no-fill, falling back to built-in sponsored modal:', err);
                        this.lastAdTime = Date.now();
                        // Show built-in sponsored modal if SDK failed to render so user always sees the ad on download/play
                        this.showCustomModalAd(proceed, contextLabel);
                        return;
                    }
                } else {
                    console.warn(`[Monetag] SDK function ${AdConfig.monetagSdkFunction} unavailable. Using fallback sponsored interstitial.`);
                    this.showCustomModalAd(proceed, contextLabel);
                    return;
                }
            }

            // --- 2. ADSGRAM FLOW (IF CONFIGURED) ---
            if (AdConfig.provider === 'adsgram' && window.Adsgram) {
                try {
                    if (!this.adsgramController) {
                        this.adsgramController = window.Adsgram.init({
                            blockId: AdConfig.adsgramBlockId,
                            debug: false
                        });
                    }
                    await this.adsgramController.show();
                    this.lastAdTime = Date.now();
                    proceed();
                    return;
                } catch (err) {
                    console.warn('[Adsgram] Ad dismissed or error, using fallback modal:', err);
                    this.showCustomModalAd(proceed, contextLabel);
                    return;
                }
            }

            // --- 3. FALLBACK BUILT-IN SPONSORED MODAL ---
            this.showCustomModalAd(proceed, contextLabel);
        });
    }

    /**
     * Dedicated helper for Download buttons — ALWAYS shows an ad before starting download
     */
    showDownloadAd(onComplete = null) {
        return this.showVideoAd(onComplete, true, 'download');
    }

    showCustomModalAd(onComplete, contextLabel = 'stream') {
        this.lastAdTime = Date.now();
        const adModal = document.getElementById('ad-interstitial-modal');
        const adTimerSpan = document.getElementById('ad-countdown-timer');
        const adCountdownWrap = document.querySelector('.ad-countdown');
        const skipBtn = document.getElementById('ad-skip-btn');
        const adTitle = document.getElementById('ad-modal-title');
        const adDesc = document.getElementById('ad-modal-desc');

        if (!adModal) {
            onComplete();
            return;
        }

        if (adTitle) {
            adTitle.textContent = contextLabel === 'download'
                ? 'Unlocking High-Speed Direct Download'
                : 'Preparing Ultra-Smooth Cloud Stream';
        }
        if (adDesc) {
            adDesc.textContent = contextLabel === 'download'
                ? 'Your direct file transfer will begin automatically right after this sponsor message.'
                : 'Connecting to dedicated high-bandwidth edge server for zero-buffer playback.';
        }
        if (skipBtn) {
            skipBtn.textContent = contextLabel === 'download'
                ? 'Start Direct Download Now ➔'
                : 'Continue to Video Player ➔';
        }

        adModal.style.display = 'flex';
        let secondsLeft = 3;
        if (adTimerSpan) adTimerSpan.textContent = secondsLeft;
        if (adCountdownWrap) adCountdownWrap.style.display = 'inline';
        if (skipBtn) skipBtn.style.display = 'none';

        let closed = false;
        const finishAd = () => {
            if (closed) return;
            closed = true;
            clearInterval(interval);
            adModal.style.display = 'none';
            if (skipBtn) skipBtn.onclick = null;
            onComplete();
        };

        const interval = setInterval(() => {
            secondsLeft--;
            if (adTimerSpan) adTimerSpan.textContent = Math.max(0, secondsLeft);
            if (secondsLeft <= 0) {
                clearInterval(interval);
                if (adCountdownWrap) adCountdownWrap.style.display = 'none';
                if (skipBtn) {
                    skipBtn.style.display = 'inline-block';
                } else {
                    finishAd();
                }
            }
        }, 1000);

        if (skipBtn) {
            skipBtn.onclick = finishAd;
        }
    }
}

window.adManager = new AdManager();
