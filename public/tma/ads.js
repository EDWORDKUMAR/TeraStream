/**
 * Pluggable Ad & Monetization Manager for Telegram Mini App
 * Designed for Adsgram, Monetag, Google AdSense, or Custom Telegram Ads.
 * 
 * To activate ads:
 * Simply change `enabled: true` and configure your ad block IDs below.
 */

const AdConfig = {
    // ⚙️ Set to true when you want to show ads
    enabled: false,

    // Provider options: 'adsgram' | 'monetag' | 'custom'
    provider: 'custom',

    // Banner ad slots
    bannerTopEnabled: true,
    bannerBottomEnabled: false,

    // Interstitial ad before video playback
    interstitialBeforePlay: true,
    interstitialFrequencySeconds: 60, // Don't show more than once per minute

    // Placeholder / Custom Ad HTML for testing
    customBannerHtml: `
        <div style="background: linear-gradient(90deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15)); border: 1px dashed rgba(99,102,241,0.3); border-radius: 10px; padding: 10px; text-align: center; font-size: 0.75rem; color: var(--tg-theme-hint-color, #94a3b8);">
            📢 <strong>Sponsored Space</strong> • Your Telegram Ad Banner Here (Configure in <code>ads.js</code>)
        </div>
    `
};

class AdManager {
    constructor() {
        this.lastAdTime = 0;
        this.isInitialized = false;
    }

    init() {
        if (!AdConfig.enabled) {
            console.log('[AdManager] Ads are currently disabled. Set AdConfig.enabled = true to activate.');
            return;
        }

        this.isInitialized = true;
        this.renderBanners();
        console.log('[AdManager] Monetization engine initialized with provider:', AdConfig.provider);
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
     * Call this before playing a video.
     * If ads are disabled or on cooldown, callback() is invoked immediately with zero delay.
     */
    showVideoAd(onComplete) {
        if (!AdConfig.enabled || !AdConfig.interstitialBeforePlay) {
            onComplete();
            return;
        }

        const now = Date.now();
        const elapsed = (now - this.lastAdTime) / 1000;

        if (elapsed < AdConfig.interstitialFrequencySeconds) {
            // Still in cooldown
            onComplete();
            return;
        }

        this.lastAdTime = now;
        console.log('[AdManager] Showing interstitial ad before playback...');

        // Trigger Ad Modal / Overlay
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
