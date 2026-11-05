/**
 * Pluggable Ad & Monetization Manager for Telegram Mini App
 * Official Monetag Rewarded Interstitial Integration (Zone ID: 12191197)
 * SDK: <script src="https://libtl.com/sdk.js" data-zone="12191197" data-sdk="show_12191197"></script>
 */

const AdConfig = {
    // ⚙️ Set to true to activate ads
    enabled: true,

    // Provider options: 'monetag' | 'adsgram' | 'custom'
    provider: 'monetag',

    // Monetag Rewarded Interstitial Configuration
    monetagZoneId: '12191197',
    monetagSdkFunction: 'show_12191197',

    // Optional Adsgram Block ID (kept for fallback)
    adsgramBlockId: '54835',

    // Rewarded / Interstitial ad before video playback or stream download
    interstitialBeforePlay: true,
    interstitialFrequencySeconds: 0, // 0 = trigger every time (or set e.g. 15 for 15s cooldown)

    // Banner ad slots
    bannerTopEnabled: false,
    bannerBottomEnabled: false,

    // Placeholder / Custom Ad HTML for testing
    customBannerHtml: `
        <div style="background: linear-gradient(90deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15)); border: 1px dashed rgba(99,102,241,0.3); border-radius: 10px; padding: 10px; text-align: center; font-size: 0.75rem; color: var(--tg-theme-hint-color, #94a3b8);">
            📢 <strong>Sponsored Space</strong> • Monetag Monetization Active
        </div>
    `
};

class AdManager {
    constructor() {
        this.lastAdTime = 0;
        this.isInitialized = false;
        this.adsgramController = null;
    }

    init() {
        if (!AdConfig.enabled) {
            console.log('[AdManager] Ads are currently disabled.');
            return;
        }

        this.isInitialized = true;
        console.log(`[AdManager] Monetization engine initialized with provider: ${AdConfig.provider} (Monetag Zone: ${AdConfig.monetagZoneId})`);

        this.renderBanners();
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
     * Show Rewarded Ad before playing or downloading.
     * Guaranteed to return a Promise AND call onComplete() so playback never freezes or fails.
     * @param {Function} onComplete Callback when ad completes/dismisses
     * @param {Boolean} force If true, bypasses any cooldown (useful for Fast Download & Mid-roll ads)
     */
    showVideoAd(onComplete, force = false) {
        return new Promise(async (resolve) => {
            const proceed = () => {
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

            // --- 1. MONETAG REWARDED INTERSTITIAL FLOW ---
            if (AdConfig.provider === 'monetag') {
                const sdkFn = window[AdConfig.monetagSdkFunction] || window.show_12191197;
                if (typeof sdkFn === 'function') {
                    console.log(`[AdManager] Showing Monetag Rewarded Interstitial (Zone: ${AdConfig.monetagZoneId})...`);
                    try {
                        await sdkFn();
                        console.log('[Monetag] Rewarded ad completed successfully.');
                        this.lastAdTime = Date.now();
                        proceed();
                        return;
                    } catch (err) {
                        console.warn('[Monetag] Ad dismissed, skipped or load error:', err);
                        this.lastAdTime = Date.now();
                        proceed();
                        return;
                    }
                } else {
                    console.warn(`[Monetag] SDK function ${AdConfig.monetagSdkFunction} not loaded yet on window. Proceeding to stream.`);
                    proceed();
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
                    console.warn('[Adsgram] Ad dismissed or error:', err);
                    this.lastAdTime = Date.now();
                    proceed();
                    return;
                }
            }

            // --- 3. FALLBACK CUSTOM MODAL ---
            this.showCustomModalAd(proceed);
        });
    }

    showCustomModalAd(onComplete) {
        this.lastAdTime = Date.now();
        const adModal = document.getElementById('ad-interstitial-modal');
        const adTimerSpan = document.getElementById('ad-countdown-timer');
        const skipBtn = document.getElementById('ad-skip-btn');

        if (adModal) {
            adModal.style.display = 'flex';
            let secondsLeft = 3;
            if (adTimerSpan) adTimerSpan.textContent = secondsLeft;
            if (skipBtn) skipBtn.style.display = 'none';

            const interval = setInterval(() => {
                secondsLeft--;
                if (adTimerSpan) adTimerSpan.textContent = secondsLeft;
                if (secondsLeft <= 0) {
                    clearInterval(interval);
                    if (skipBtn) skipBtn.style.display = 'inline-block';
                }
            }, 1000);

            const handleClose = () => {
                clearInterval(interval);
                adModal.style.display = 'none';
                if (skipBtn) skipBtn.removeEventListener('click', handleClose);
                onComplete();
            };

            if (skipBtn) {
                skipBtn.addEventListener('click', handleClose);
            } else {
                setTimeout(handleClose, 3000);
            }
        } else {
            onComplete();
        }
    }
}

window.adManager = new AdManager();
