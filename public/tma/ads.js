/**
 * Pluggable Ad & Monetization Manager for Telegram Mini App
 * Official Adsgram Rewarded Video Integration (Block ID: 57965)
 * Documentation: https://docs.adsgram.ai/publisher/reward-interstitial-integration
 */

const AdConfig = {
    // ⚙️ Set to true to activate ads
    enabled: true,

    // Provider options: 'adsgram' | 'custom'
    provider: 'adsgram',

    // Adsgram Rewarded Video Block ID
    blockId: '57965',

    // Rewarded / Interstitial ad before video playback or stream download
    interstitialBeforePlay: true,
    interstitialFrequencySeconds: 0, // 0 = trigger every time (or set e.g. 15 for 15s cooldown)

    // Banner ad slots
    bannerTopEnabled: false,
    bannerBottomEnabled: false,

    // Placeholder / Custom Ad HTML for testing
    customBannerHtml: `
        <div style="background: linear-gradient(90deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15)); border: 1px dashed rgba(99,102,241,0.3); border-radius: 10px; padding: 10px; text-align: center; font-size: 0.75rem; color: var(--tg-theme-hint-color, #94a3b8);">
            📢 <strong>Sponsored Space</strong> • Adsgram Monetization Active
        </div>
    `
};

class AdManager {
    constructor() {
        this.lastAdTime = 0;
        this.isInitialized = false;
        this.adController = null;
    }

    init() {
        if (!AdConfig.enabled) {
            console.log('[AdManager] Ads are currently disabled.');
            return;
        }

        this.isInitialized = true;
        console.log(`[AdManager] Monetization engine initialized with provider: ${AdConfig.provider} (Block ID: ${AdConfig.blockId})`);

        // Initialize Adsgram controller if available on window
        if (AdConfig.provider === 'adsgram' && window.Adsgram) {
            try {
                this.adController = window.Adsgram.init({
                    blockId: AdConfig.blockId,
                    debug: false
                });
                console.log('[AdManager] Adsgram controller initialized successfully.');
            } catch (err) {
                console.warn('[AdManager] Adsgram init warning:', err);
            }
        }

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
     * Show Rewarded Video Ad before playing or downloading.
     * Guaranteed to return a Promise AND call onComplete() so playback never freezes or fails.
     */
    showVideoAd(onComplete) {
        return new Promise(async (resolve) => {
            const proceed = () => {
                if (typeof onComplete === 'function') {
                    try { onComplete(); } catch (e) { console.error('[AdManager] Callback error:', e); }
                }
                resolve();
            };

            if (!AdConfig.enabled || !AdConfig.interstitialBeforePlay) {
                proceed();
                return;
            }

            const now = Date.now();
            const elapsed = (now - this.lastAdTime) / 1000;

            if (AdConfig.interstitialFrequencySeconds > 0 && elapsed < AdConfig.interstitialFrequencySeconds) {
                console.log(`[AdManager] Cooldown active (${Math.round(elapsed)}s < ${AdConfig.interstitialFrequencySeconds}s), skipping ad.`);
                proceed();
                return;
            }

            // --- 1. ADSGRAM REWARDED VIDEO FLOW ---
            if (AdConfig.provider === 'adsgram') {
                if (window.Adsgram) {
                    try {
                        if (!this.adController) {
                            this.adController = window.Adsgram.init({
                                blockId: AdConfig.blockId,
                                debug: false
                            });
                        }

                        console.log('[AdManager] Showing Adsgram Rewarded Video (Block ID: 57965)...');
                        const result = await this.adController.show();
                        console.log('[Adsgram] Rewarded Video completed successfully:', result);
                        this.lastAdTime = Date.now();
                        proceed();
                        return;
                    } catch (err) {
                        console.warn('[Adsgram] Ad dismissed, skipped or load error:', err);
                        // Do not block the stream if the ad was skipped or errored
                        this.lastAdTime = Date.now();
                        proceed();
                        return;
                    }
                } else {
                    console.warn('[Adsgram] window.Adsgram SDK not loaded. Proceeding to stream.');
                    proceed();
                    return;
                }
            }

            // --- 2. FALLBACK CUSTOM MODAL (IF PROVIDER IS 'custom') ---
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
