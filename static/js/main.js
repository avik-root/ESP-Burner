/**
 * Esp Burner — Frontend Application Logic
 * Developed by MintFire | v1.0.0
 *
 * Handles WebSocket communication, port management,
 * erase controls, and live terminal output.
 */

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
    socket: null,
    ports: [],
    selectedPort: null,
    boardInfo: null,
    isErasing: false,
    eraseMode: 'full',
    portPollInterval: null,
    wsConnected: false,
};

// ─── DOM Elements ───────────────────────────────────────────────────────────
const dom = {
    wsStatus: document.getElementById('ws-status'),
    statPortsCount: document.getElementById('stat-ports-count'),
    statEspCount: document.getElementById('stat-esp-count'),
    statChipType: document.getElementById('stat-chip-type'),
    statFlashSize: document.getElementById('stat-flash-size'),
    portsList: document.getElementById('ports-list'),
    boardInfoContent: document.getElementById('board-info-content'),
    erasePort: document.getElementById('erase-port'),
    eraseBaud: document.getElementById('erase-baud'),
    modeFull: document.getElementById('mode-full'),
    modeRegion: document.getElementById('mode-region'),
    regionOptions: document.getElementById('region-options'),
    eraseStartAddr: document.getElementById('erase-start-addr'),
    eraseSize: document.getElementById('erase-size'),
    advToggle: document.getElementById('adv-toggle'),
    advContent: document.getElementById('adv-content'),
    eraseBefore: document.getElementById('erase-before'),
    eraseAfter: document.getElementById('erase-after'),
    progressContainer: document.getElementById('progress-container'),
    progressLabel: document.getElementById('progress-label'),
    progressPercent: document.getElementById('progress-percent'),
    progressFill: document.getElementById('progress-fill'),
    btnErase: document.getElementById('btn-erase'),
    btnRefreshPorts: document.getElementById('btn-refresh-ports'),
    btnClearLog: document.getElementById('btn-clear-log'),
    terminalOutput: document.getElementById('terminal-output'),
    confirmModal: document.getElementById('confirm-modal'),
    modalDetails: document.getElementById('modal-details'),
    modalCancel: document.getElementById('modal-cancel'),
    modalConfirm: document.getElementById('modal-confirm'),
};

// ─── REST API Fallback for Ports ────────────────────────────────────────────
async function fetchPortsViaREST() {
    try {
        const resp = await fetch('/api/ports');
        const data = await resp.json();
        if (data.success) {
            const oldDevices = state.ports.map(p => p.device).sort().join(',');
            const newDevices = data.ports.map(p => p.device).sort().join(',');

            state.ports = data.ports;
            renderPorts();
            updatePortDropdown();
            updateStats();

            if (oldDevices !== newDevices) {
                pulseStatCard('stat-ports');
            }
            return true;
        }
    } catch (err) {
        // Server unreachable
    }
    return false;
}

// ─── Auto-Polling for Ports ─────────────────────────────────────────────────
function startPortPolling() {
    if (state.portPollInterval) clearInterval(state.portPollInterval);
    state.portPollInterval = setInterval(() => {
        fetchPortsViaREST();
    }, 3000);
}

function stopPortPolling() {
    if (state.portPollInterval) {
        clearInterval(state.portPollInterval);
        state.portPollInterval = null;
    }
}

// ─── WebSocket Connection ───────────────────────────────────────────────────
function initSocket() {
    state.socket = io({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling'],
    });

    state.socket.on('connect', () => {
        state.wsConnected = true;
        setConnectionStatus('connected', 'Connected');
        addTerminalLine('[*] WebSocket connected', 'success');
        // Refresh ports immediately on reconnect
        state.socket.emit('request_ports');
    });

    state.socket.on('disconnect', (reason) => {
        state.wsConnected = false;
        setConnectionStatus('disconnected', 'Disconnected');
        addTerminalLine(`[!] WebSocket disconnected: ${reason}`, 'warning');
    });

    state.socket.on('reconnect_attempt', (attempt) => {
        setConnectionStatus('disconnected', `Reconnecting (${attempt})...`);
    });

    state.socket.on('reconnect', (attempt) => {
        setConnectionStatus('connected', 'Connected');
        addTerminalLine(`[*] WebSocket reconnected after ${attempt} attempt(s)`, 'success');
        state.socket.emit('request_ports');
    });

    state.socket.on('connect_error', () => {
        state.wsConnected = false;
        setConnectionStatus('disconnected', 'Error');
    });

    state.socket.on('connected', (data) => {
        addTerminalLine(`[*] ${data.message}`, 'info');
    });

    state.socket.on('ports_changed', (data) => {
        const oldDevices = state.ports.map(p => p.device).sort().join(',');
        state.ports = data.ports;
        const newDevices = state.ports.map(p => p.device).sort().join(',');

        renderPorts();
        updatePortDropdown();
        updateStats();

        if (oldDevices !== newDevices && oldDevices !== '') {
            pulseStatCard('stat-ports');
            if (data.added && data.added.length > 0) {
                data.added.forEach(p => {
                    addTerminalLine(`[+] Device connected: ${p}`, 'success');
                });
            }
            if (data.removed && data.removed.length > 0) {
                data.removed.forEach(p => {
                    addTerminalLine(`[-] Device disconnected: ${p}`, 'warning');
                });
            }
        }
    });

    state.socket.on('erase_log', (data) => {
        addTerminalLine(data.message, data.type);
    });

    state.socket.on('erase_progress', (data) => {
        updateProgress(data.progress, data.status);
    });

    state.socket.on('erase_complete', (data) => {
        state.isErasing = false;
        dom.btnErase.disabled = false;
        dom.btnErase.innerHTML = '<i class="fa-solid fa-fire"></i><span>ERASE FLASH</span>';

        if (data.success) {
            dom.progressFill.style.background = 'linear-gradient(90deg, var(--accent-green), #16a34a)';
        } else {
            dom.progressFill.style.background = 'linear-gradient(90deg, var(--accent-red), #dc2626)';
        }
    });
}

// ─── Connection Status ──────────────────────────────────────────────────────
function setConnectionStatus(status, text) {
    dom.wsStatus.className = `status-indicator ${status}`;
    dom.wsStatus.querySelector('.status-text').textContent = text;
}

// ─── Port Rendering ─────────────────────────────────────────────────────────
function renderPorts() {
    if (state.ports.length === 0) {
        dom.portsList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-plug-circle-xmark"></i>
                <p>No devices detected</p>
                <span>Connect an ESP board via USB</span>
            </div>`;
        return;
    }

    dom.portsList.innerHTML = state.ports.map(port => `
        <div class="port-item ${port.is_esp ? 'is-esp' : ''}" data-device="${port.device}">
            <div class="port-info">
                <div class="port-icon">
                    <i class="fa-solid ${port.is_esp ? 'fa-microchip' : 'fa-plug'}"></i>
                </div>
                <div class="port-details">
                    <div class="port-name">${port.device}</div>
                    <div class="port-desc">${port.description} — ${port.manufacturer}</div>
                </div>
            </div>
            <div class="port-actions">
                ${port.is_esp ? '<span class="port-badge">ESP</span>' : ''}
                <button class="btn btn-sm btn-primary btn-connect" data-port="${port.device}" title="Connect & Get Info">
                    <i class="fa-solid fa-link"></i>
                </button>
            </div>
        </div>
    `).join('');

    // Attach connect button listeners
    dom.portsList.querySelectorAll('.btn-connect').forEach(btn => {
        btn.addEventListener('click', () => connectToPort(btn.dataset.port));
    });
}

// ─── Port Dropdown ──────────────────────────────────────────────────────────
function updatePortDropdown() {
    const current = dom.erasePort.value;
    dom.erasePort.innerHTML = '<option value="">— Select a port —</option>';
    state.ports.forEach(port => {
        const opt = document.createElement('option');
        opt.value = port.device;
        opt.textContent = `${port.device} (${port.description})`;
        if (port.device === current) opt.selected = true;
        dom.erasePort.appendChild(opt);
    });
}

// ─── Stats ──────────────────────────────────────────────────────────────────
function updateStats() {
    dom.statPortsCount.textContent = state.ports.length;
    dom.statEspCount.textContent = state.ports.filter(p => p.is_esp).length;

    if (state.boardInfo) {
        dom.statChipType.textContent = state.boardInfo.chip_type || '—';
        dom.statFlashSize.textContent = state.boardInfo.flash_size || '—';
    }
}

function pulseStatCard(id) {
    const card = document.getElementById(id);
    if (!card) return;
    card.style.transition = 'box-shadow 0.3s ease';
    card.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.3)';
    setTimeout(() => {
        card.style.boxShadow = '';
    }, 800);
}

// ─── Connect to Port ────────────────────────────────────────────────────────
async function connectToPort(portDevice) {
    addTerminalLine(`[*] Connecting to ${portDevice}...`, 'info');

    // Set port in dropdown
    dom.erasePort.value = portDevice;

    try {
        const resp = await fetch('/api/board-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                port: portDevice,
                baud_rate: parseInt(dom.eraseBaud.value)
            })
        });

        const data = await resp.json();

        if (data.success) {
            state.boardInfo = data.info;
            state.selectedPort = portDevice;
            renderBoardInfo(data.info);
            updateStats();
            pulseStatCard('stat-chip');
        } else {
            addTerminalLine(`[✗] Connection failed: ${data.error}`, 'error');
            renderBoardInfoError(data.error);
        }
    } catch (err) {
        addTerminalLine(`[✗] Network error: ${err.message}`, 'error');
    }
}

// ─── Board Info Rendering ───────────────────────────────────────────────────
function renderBoardInfo(info) {
    let featuresHtml = '';
    if (info.features && info.features.length > 0) {
        featuresHtml = `
            <div class="board-features">
                <div class="features-label"><i class="fa-solid fa-star"></i> Features</div>
                <div class="feature-tags">
                    ${info.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
                </div>
            </div>`;
    }

    dom.boardInfoContent.innerHTML = `
        <div class="board-info-grid">
            <div class="board-info-item">
                <i class="fa-solid fa-microchip"></i>
                <div class="info-text">
                    <span class="info-label">Chip Type</span>
                    <span class="info-value">${info.chip_type}</span>
                </div>
            </div>
            <div class="board-info-item">
                <i class="fa-solid fa-fingerprint"></i>
                <div class="info-text">
                    <span class="info-label">MAC Address</span>
                    <span class="info-value">${info.mac_address}</span>
                </div>
            </div>
            <div class="board-info-item">
                <i class="fa-solid fa-hard-drive"></i>
                <div class="info-text">
                    <span class="info-label">Flash Size</span>
                    <span class="info-value">${info.flash_size}</span>
                </div>
            </div>
            <div class="board-info-item">
                <i class="fa-solid fa-gem"></i>
                <div class="info-text">
                    <span class="info-label">Crystal</span>
                    <span class="info-value">${info.crystal}</span>
                </div>
            </div>
        </div>
        ${featuresHtml}
    `;
}

function renderBoardInfoError(error) {
    dom.boardInfoContent.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-circle-exclamation" style="color: var(--accent-red);"></i>
            <p style="color: var(--accent-red);">Connection Failed</p>
            <span>${error}</span>
        </div>`;
}

// ─── Terminal ───────────────────────────────────────────────────────────────
function addTerminalLine(message, type = 'info') {
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.innerHTML = `
        <span class="terminal-timestamp">${timestamp}</span>
        <span class="terminal-text">${escapeHtml(message)}</span>`;

    dom.terminalOutput.appendChild(line);
    dom.terminalOutput.scrollTop = dom.terminalOutput.scrollHeight;

    // Limit lines to 500
    while (dom.terminalOutput.children.length > 500) {
        dom.terminalOutput.removeChild(dom.terminalOutput.firstChild);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── Progress ───────────────────────────────────────────────────────────────
function updateProgress(percent, status) {
    dom.progressContainer.classList.remove('hidden');
    dom.progressFill.style.width = `${percent}%`;
    dom.progressPercent.textContent = `${percent}%`;
    dom.progressFill.style.background = 'linear-gradient(90deg, var(--accent-orange), #ff9a6c)';

    const labels = {
        connecting: 'Connecting to device...',
        connected: 'Connected — Preparing erase...',
        erasing: 'Erasing flash memory...',
        completing: 'Finalizing...',
        completed: 'Erase completed!',
        failed: 'Erase failed!',
    };
    dom.progressLabel.textContent = labels[status] || status;
}

// ─── Erase Mode Toggle ─────────────────────────────────────────────────────
dom.modeFull.addEventListener('click', () => {
    state.eraseMode = 'full';
    dom.modeFull.classList.add('active');
    dom.modeRegion.classList.remove('active');
    dom.regionOptions.classList.add('hidden');
});

dom.modeRegion.addEventListener('click', () => {
    state.eraseMode = 'region';
    dom.modeRegion.classList.add('active');
    dom.modeFull.classList.remove('active');
    dom.regionOptions.classList.remove('hidden');
});

// ─── Advanced Options Accordion ─────────────────────────────────────────────
dom.advToggle.addEventListener('click', () => {
    dom.advToggle.classList.toggle('open');
    dom.advContent.classList.toggle('open');
});

// ─── Refresh Ports ──────────────────────────────────────────────────────────
dom.btnRefreshPorts.addEventListener('click', async () => {
    // Add spin animation
    const icon = dom.btnRefreshPorts.querySelector('i');
    icon.style.animation = 'spin 0.8s ease';
    dom.btnRefreshPorts.disabled = true;

    addTerminalLine('[*] Scanning for serial ports...', 'info');

    // Try WebSocket first, then fall back to REST API
    let refreshed = false;

    if (state.wsConnected && state.socket) {
        state.socket.emit('request_ports');
        refreshed = true;
    }

    // Always also fetch via REST API as a reliable fallback
    const restResult = await fetchPortsViaREST();
    if (restResult) {
        refreshed = true;
        addTerminalLine(`[OK] Found ${state.ports.length} port(s)`, 'success');
    }

    if (!refreshed) {
        addTerminalLine('[!] Unable to scan ports — server unreachable', 'error');
    }

    setTimeout(() => {
        icon.style.animation = '';
        dom.btnRefreshPorts.disabled = false;
    }, 800);
});

// ─── Clear Terminal ─────────────────────────────────────────────────────────
dom.btnClearLog.addEventListener('click', () => {
    dom.terminalOutput.innerHTML = '';
    addTerminalLine('[*] Terminal cleared', 'info');
});

// ─── Erase Button ───────────────────────────────────────────────────────────
dom.btnErase.addEventListener('click', () => {
    const port = dom.erasePort.value;
    if (!port) {
        addTerminalLine('[!] Please select a port first', 'warning');
        return;
    }

    // Build details for confirmation
    const baudRate = dom.eraseBaud.value;
    const beforeReset = dom.eraseBefore.value;
    const afterReset = dom.eraseAfter.value;

    let detailsHtml = `
        <div><strong>Port:</strong> ${port}</div>
        <div><strong>Baud Rate:</strong> ${baudRate}</div>
        <div><strong>Mode:</strong> ${state.eraseMode === 'full' ? 'Full Flash Erase' : 'Region Erase'}</div>`;

    if (state.eraseMode === 'region') {
        detailsHtml += `
            <div><strong>Start Address:</strong> ${dom.eraseStartAddr.value}</div>
            <div><strong>Size:</strong> ${dom.eraseSize.value}</div>`;
    }

    detailsHtml += `
        <div><strong>Before:</strong> ${beforeReset}</div>
        <div><strong>After:</strong> ${afterReset}</div>`;

    dom.modalDetails.innerHTML = detailsHtml;
    dom.confirmModal.classList.remove('hidden');
});

// ─── Modal Actions ──────────────────────────────────────────────────────────
dom.modalCancel.addEventListener('click', () => {
    dom.confirmModal.classList.add('hidden');
});

dom.modalConfirm.addEventListener('click', () => {
    dom.confirmModal.classList.add('hidden');
    startErase();
});

// Close modal on overlay click
dom.confirmModal.addEventListener('click', (e) => {
    if (e.target === dom.confirmModal) {
        dom.confirmModal.classList.add('hidden');
    }
});

// ─── Start Erase ────────────────────────────────────────────────────────────
async function startErase() {
    const port = dom.erasePort.value;
    if (!port || state.isErasing) return;

    state.isErasing = true;
    dom.btnErase.disabled = true;
    dom.btnErase.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>ERASING...</span>';

    // Reset progress
    dom.progressContainer.classList.remove('hidden');
    dom.progressFill.style.width = '0%';
    dom.progressPercent.textContent = '0%';
    dom.progressLabel.textContent = 'Starting...';
    dom.progressFill.style.background = 'linear-gradient(90deg, var(--accent-orange), #ff9a6c)';

    const payload = {
        port: port,
        baud_rate: dom.eraseBaud.value,
        erase_mode: state.eraseMode,
        start_addr: dom.eraseStartAddr.value,
        size: dom.eraseSize.value,
        before_reset: dom.eraseBefore.value,
        after_reset: dom.eraseAfter.value,
    };

    try {
        const resp = await fetch('/api/erase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await resp.json();
        if (!data.success) {
            addTerminalLine(`[✗] ${data.error}`, 'error');
            state.isErasing = false;
            dom.btnErase.disabled = false;
            dom.btnErase.innerHTML = '<i class="fa-solid fa-fire"></i><span>ERASE FLASH</span>';
        }
    } catch (err) {
        addTerminalLine(`[✗] Network error: ${err.message}`, 'error');
        state.isErasing = false;
        dom.btnErase.disabled = false;
        dom.btnErase.innerHTML = '<i class="fa-solid fa-fire"></i><span>ERASE FLASH</span>';
    }
}

// ─── Add spin animation ─────────────────────────────────────────────────────
const spinStyle = document.createElement('style');
spinStyle.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(spinStyle);

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    // Start auto-polling ports via REST as a reliable fallback
    startPortPolling();
    // Initial REST fetch
    fetchPortsViaREST();
});
