document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const authModal = document.getElementById('auth-modal');
    const adminKeyInput = document.getElementById('admin-key-input');
    const loginBtn = document.getElementById('login-btn');
    const authError = document.getElementById('auth-error');
    const dashboardApp = document.getElementById('dashboard-app');
    const logoutBtn = document.getElementById('logout-btn');

    // Stats Elements
    const statTotal = document.getElementById('stat-total');
    const statTrending = document.getElementById('stat-trending');
    const statLatest = document.getElementById('stat-latest');
    const statPopular = document.getElementById('stat-popular');

    // Form Elements
    const addVideoForm = document.getElementById('add-video-form');
    const videoUrlInput = document.getElementById('video-url');
    const videoCategorySelect = document.getElementById('video-category');
    const customTitleInput = document.getElementById('custom-title');
    const submitBtn = document.getElementById('submit-btn');
    const fetchProgress = document.getElementById('fetch-progress');
    const alertBox = document.getElementById('alert-box');

    // Table Elements
    const videoTableBody = document.getElementById('video-table-body');
    const emptyState = document.getElementById('empty-state');
    const searchInput = document.getElementById('search-input');
    const filterCategory = document.getElementById('filter-category');

    let adminKey = localStorage.getItem('tma_admin_key') || '';
    let allVideos = [];

    // --- Authentication ---
    if (adminKey) {
        verifyAndLoad();
    } else {
        authModal.style.display = 'flex';
        adminKeyInput.focus();
    }

    loginBtn.addEventListener('click', handleLogin);
    adminKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('tma_admin_key');
        adminKey = '';
        dashboardApp.style.display = 'none';
        authModal.style.display = 'flex';
        adminKeyInput.value = '';
    });

    const clearAllBtn = document.getElementById('clear-all-btn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to completely clear ALL videos from all feeds?')) return;
            try {
                const res = await fetch('/api/tma/admin/clear-all', {
                    method: 'POST',
                    headers: { 'x-admin-key': adminKey }
                });
                const data = await res.json();
                if (data.status === 'success') {
                    showAlert('All videos cleared successfully', 'success');
                    refreshDashboard();
                } else {
                    showAlert(data.message || 'Failed to clear videos', 'danger');
                }
            } catch (e) {
                showAlert('Failed to clear videos', 'danger');
            }
        });
    }

    async function handleLogin() {
        const key = adminKeyInput.value.trim();
        if (!key) return;

        loginBtn.disabled = true;
        loginBtn.textContent = 'Verifying...';
        authError.style.display = 'none';

        try {
            const res = await fetch(`/api/tma/admin/stats?adminKey=${encodeURIComponent(key)}`);
            const data = await res.json();

            if (res.ok && data.status === 'success') {
                adminKey = key;
                localStorage.setItem('tma_admin_key', key);
                authModal.style.display = 'none';
                dashboardApp.style.display = 'block';
                renderDashboard(data);
            } else {
                throw new Error(data.message || 'Invalid key');
            }
        } catch (err) {
            authError.style.display = 'block';
            authError.textContent = err.message || 'Invalid admin secret key.';
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login to Panel';
        }
    }

    async function verifyAndLoad() {
        try {
            const res = await fetch(`/api/tma/admin/stats?adminKey=${encodeURIComponent(adminKey)}`);
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                authModal.style.display = 'none';
                dashboardApp.style.display = 'block';
                renderDashboard(data);
            } else {
                throw new Error('Expired key');
            }
        } catch (err) {
            localStorage.removeItem('tma_admin_key');
            adminKey = '';
            authModal.style.display = 'flex';
        }
    }

    function renderDashboard(data) {
        // Update stats
        if (data.stats) {
            statTotal.textContent = data.stats.total || 0;
            statTrending.textContent = data.stats.trending || 0;
            statLatest.textContent = data.stats.latest || 0;
            statPopular.textContent = data.stats.popular || 0;
        }

        allVideos = data.items || [];
        applyFilterAndRender();
    }

    // --- Submit Link (Single or Folder) ---
    addVideoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = videoUrlInput.value.trim();
        const category = videoCategorySelect.value;
        const customTitle = customTitleInput.value.trim();

        if (!url) return;

        // UI state
        submitBtn.disabled = true;
        fetchProgress.style.display = 'flex';
        hideAlert();

        try {
            const res = await fetch('/api/tma/admin/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': adminKey
                },
                body: JSON.stringify({
                    url,
                    category,
                    customTitle
                })
            });

            const data = await res.json();
            if (!res.ok || data.status === 'error') {
                throw new Error(data.message || 'Failed to extract video details');
            }

            showAlert(`✅ ${data.message}`, 'success');
            videoUrlInput.value = '';
            customTitleInput.value = '';

            // Reload stats & table
            refreshDashboard();

        } catch (err) {
            showAlert(`❌ Error: ${err.message}`, 'danger');
        } finally {
            submitBtn.disabled = false;
            fetchProgress.style.display = 'none';
        }
    });

    async function refreshDashboard() {
        try {
            const res = await fetch(`/api/tma/admin/stats?adminKey=${encodeURIComponent(adminKey)}&_t=${Date.now()}`, {
                cache: 'no-store'
            });
            const data = await res.json();
            if (data.status === 'success') {
                renderDashboard(data);
            }
        } catch (e) {
            console.warn('Dashboard refresh failed:', e);
        }
    }

    // --- Export Backup JSON ---
    const exportJsonBtn = document.getElementById('export-json-btn');
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', async () => {
            try {
                const res = await fetch(`/api/tma/admin/export?adminKey=${encodeURIComponent(adminKey)}&_t=${Date.now()}`);
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'tma_videos.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                showAlert('💾 Backup downloaded! Push this file to your GitHub repo (data/tma_videos.json) to keep it permanently across Render restarts.', 'success');
            } catch (err) {
                showAlert('Failed to download backup', 'danger');
            }
        });
    }

    // --- Restore Backup JSON ---
    const restoreJsonBtn = document.getElementById('restore-json-btn');
    const restoreFileInput = document.getElementById('restore-file-input');
    if (restoreJsonBtn && restoreFileInput) {
        restoreJsonBtn.addEventListener('click', () => restoreFileInput.click());
        restoreFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    if (!Array.isArray(parsed)) throw new Error('File must contain a JSON array of videos');
                    const res = await fetch('/api/tma/admin/restore', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-admin-key': adminKey
                        },
                        body: JSON.stringify({ videos: parsed })
                    });
                    const d = await res.json();
                    if (d.status === 'success') {
                        showAlert(`✅ Restored ${d.count} videos successfully!`, 'success');
                        refreshDashboard();
                    } else {
                        throw new Error(d.message);
                    }
                } catch (err) {
                    showAlert(`Failed to restore: ${err.message}`, 'danger');
                }
            };
            reader.readAsText(file);
            restoreFileInput.value = '';
        });
    }

    // --- Delete Video ---
    async function deleteVideo(id, title) {
        if (!confirm(`Are you sure you want to remove "${title}" from the Mini App?`)) return;

        try {
            const res = await fetch(`/api/tma/admin/video/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: { 'x-admin-key': adminKey }
            });

            const data = await res.json();
            if (data.status === 'success') {
                showAlert(`🗑️ Video removed successfully.`, 'success');
                refreshDashboard();
            } else {
                throw new Error(data.message);
            }
        } catch (err) {
            showAlert(`Failed to delete: ${err.message}`, 'danger');
        }
    }

    // --- Render Table ---
    function applyFilterAndRender() {
        const query = searchInput.value.toLowerCase().trim();
        const categoryFilter = filterCategory.value;

        let filtered = allVideos;

        if (categoryFilter !== 'all') {
            filtered = filtered.filter(v => v.category === categoryFilter);
        }

        if (query) {
            filtered = filtered.filter(v => 
                (v.title && v.title.toLowerCase().includes(query)) ||
                (v.folderName && v.folderName.toLowerCase().includes(query))
            );
        }

        if (filtered.length === 0) {
            videoTableBody.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        videoTableBody.innerHTML = '';

        filtered.forEach(item => {
            const tr = document.createElement('tr');
            
            let badgeClass = 'badge-trending';
            let badgeText = '🔥 Trending';
            if (item.category === 'latest') {
                badgeClass = 'badge-latest';
                badgeText = '🆕 Latest';
            } else if (item.category === 'popular') {
                badgeClass = 'badge-popular';
                badgeText = '⭐ Popular';
            }

            const thumb = item.thumbnail || 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=200&q=80';
            const folderBadge = item.isFolder ? `<span style="font-size:0.7rem; color:#818cf8; background:rgba(99,102,241,0.15); padding:0.1rem 0.35rem; border-radius:4px; margin-left:0.35rem;">📁 ${item.folderName || 'Folder'}</span>` : '';

            tr.innerHTML = `
                <td>
                    <img src="${thumb}" class="table-thumb" alt="${item.title}" onerror="this.src='https://images.unsplash.com/photo-1536240478700-b869070f9279?w=200&q=80'">
                </td>
                <td>
                    <div class="table-title">${item.title} ${folderBadge}</div>
                    <div class="table-sub">ID: ${item.id} • Views: ${item.views || '0'}</div>
                </td>
                <td>
                    <span class="tab-badge ${badgeClass}">${badgeText}</span>
                </td>
                <td><strong>${item.size_formatted || 'N/A'}</strong></td>
                <td>${item.duration || 'Video'}</td>
                <td>
                    <button class="btn-danger-sm delete-btn" data-id="${item.id}" data-title="${encodeURIComponent(item.title)}">
                        🗑️ Delete
                    </button>
                </td>
            `;

            tr.querySelector('.delete-btn').addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const title = decodeURIComponent(e.currentTarget.getAttribute('data-title'));
                deleteVideo(id, title);
            });

            videoTableBody.appendChild(tr);
        });
    }

    searchInput.addEventListener('input', applyFilterAndRender);
    filterCategory.addEventListener('change', applyFilterAndRender);

    function showAlert(msg, type = 'success') {
        alertBox.className = `alert-box alert-${type}`;
        alertBox.textContent = msg;
        alertBox.style.display = 'block';
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideAlert() {
        alertBox.style.display = 'none';
    }
});
