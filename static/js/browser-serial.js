/**
 * Esp Burner — Browser Serial (Web Serial API + esptool-js)
 * Developed by MintFire | v1.0.0
 *
 * Enables direct browser-to-ESP communication via Web Serial API
 * and esptool-js for chip detection and flash erase.
 * Supported: Chrome 89+, Edge 89+, Opera 76+
 */

import { ESPLoader, Transport } from 'https://unpkg.com/esptool-js@0.5.7/bundle.js';

// ─── Browser Serial State ───────────────────────────────────────────────────
window.browserSerial = {
    port: null,
    transport: null,
    esploader: null,
    chip: null,
    connected: false,
    isSupported: !!navigator.serial,
};

// ─── Check Browser Compatibility ────────────────────────────────────────────
window.checkWebSerialSupport = function () {
    const compatEl = document.getElementById('browser-usb-compat');
    if (!compatEl) return;

    if (navigator.serial) {
        compatEl.innerHTML = `
            <div class="compat-badge compat-ok">
                <i class="fa-solid fa-circle-check"></i>
                <span>Web Serial API supported — Chrome/Edge</span>
            </div>`;
    } else {
        compatEl.innerHTML = `
            <div class="compat-badge compat-error">
                <i class="fa-solid fa-circle-xmark"></i>
                <span>Web Serial API not supported — Use Chrome or Edge</span>
            </div>`;
        // Disable connect button
        const btn = document.getElementById('btn-browser-connect');
        if (btn) {
            btn.disabled = true;
            btn.title = 'Web Serial API requires Chrome 89+ or Edge 89+';
        }
    }
};

// ─── Terminal Helper (uses the shared addTerminalLine function) ──────────────
function termLog(message, type = 'info') {
    if (typeof window.addTerminalLine === 'function') {
        window.addTerminalLine(message, type);
    } else {
        console.log(`[${type}] ${message}`);
    }
}

// ─── ESPLoader Terminal Adapter ─────────────────────────────────────────────
class BrowserTerminal {
    clean() {
        // no-op
    }
    writeLine(data) {
        termLog(`[ESP] ${data}`, 'info');
    }
    write(data) {
        // Filter out empty lines
        if (data && data.trim()) {
            termLog(`[ESP] ${data.trim()}`, 'info');
        }
    }
}

// ─── Connect via Web Serial API ─────────────────────────────────────────────
window.browserSerialConnect = async function () {
    const bs = window.browserSerial;

    if (!navigator.serial) {
        termLog('[FAIL] Web Serial API not supported in this browser', 'error');
        return false;
    }

    try {
        termLog('[*] Requesting USB serial port...', 'info');

        // Show the browser's native port picker
        bs.port = await navigator.serial.requestPort({
            filters: [
                { usbVendorId: 0x10C4 },  // Silicon Labs CP210x
                { usbVendorId: 0x1A86 },  // WCH CH340/CH9102
                { usbVendorId: 0x0403 },  // FTDI
                { usbVendorId: 0x303A },  // Espressif
            ]
        }).catch(() => null);

        // If filtered request fails, try without filters
        if (!bs.port) {
            bs.port = await navigator.serial.requestPort();
        }

        if (!bs.port) {
            termLog('[!] No port selected', 'warning');
            return false;
        }

        termLog('[*] Port selected, connecting to ESP...', 'info');
        updateBrowserProgress(10, 'Connecting...');

        const baudRate = parseInt(document.getElementById('erase-baud').value) || 115200;

        // Create transport and ESPLoader
        bs.transport = new Transport(bs.port, true);

        const loaderOptions = {
            transport: bs.transport,
            baudrate: baudRate,
            terminal: new BrowserTerminal(),
            debugLogging: false,
        };

        bs.esploader = new ESPLoader(loaderOptions);

        termLog('[*] Connecting to ESP bootloader...', 'info');
        updateBrowserProgress(30, 'Entering bootloader...');

        // Connect to the chip
        bs.chip = await bs.esploader.main();

        termLog(`[OK] Connected to: ${bs.chip}`, 'success');
        updateBrowserProgress(100, 'Connected');

        bs.connected = true;

        // Get chip info
        const chipInfo = {
            chip_type: bs.chip || 'Unknown',
            mac_address: bs.esploader.macAddr ? bs.esploader.macAddr() : 'Unknown',
            flash_size: 'Detecting...',
            crystal: 'Unknown',
            features: [],
        };

        // Try to detect flash size
        try {
            const flashSize = await bs.esploader.getFlashSize();
            if (flashSize) {
                chipInfo.flash_size = formatFlashSize(flashSize);
            }
        } catch (e) {
            // Flash size detection may not be available in all versions
        }

        // Update UI
        updateBrowserDeviceBadge(true, bs.chip);
        updateBrowserUSBStatus(true, bs.chip, chipInfo);

        // Update stats
        if (typeof window.updateBrowserBoardInfo === 'function') {
            window.updateBrowserBoardInfo(chipInfo);
        }

        return true;

    } catch (err) {
        termLog(`[FAIL] Connection failed: ${err.message}`, 'error');
        updateBrowserProgress(0, 'Failed');
        bs.connected = false;
        updateBrowserDeviceBadge(false);
        updateBrowserUSBStatus(false);
        return false;
    }
};

// ─── Disconnect ─────────────────────────────────────────────────────────────
window.browserSerialDisconnect = async function () {
    const bs = window.browserSerial;

    try {
        if (bs.transport) {
            await bs.transport.disconnect();
            termLog('[OK] Disconnected from ESP', 'success');
        }
    } catch (err) {
        termLog(`[!] Disconnect warning: ${err.message}`, 'warning');
    }

    bs.port = null;
    bs.transport = null;
    bs.esploader = null;
    bs.chip = null;
    bs.connected = false;

    updateBrowserDeviceBadge(false);
    updateBrowserUSBStatus(false);
    updateBrowserProgress(0, '');
};

// ─── Browser-Side Erase Flash ───────────────────────────────────────────────
window.browserSerialErase = async function () {
    const bs = window.browserSerial;

    if (!bs.connected || !bs.esploader) {
        termLog('[FAIL] No ESP device connected via browser USB', 'error');
        return false;
    }

    try {
        termLog('[CMD] Starting browser-side flash erase...', 'info');
        updateBrowserProgress(15, 'Preparing erase...');

        termLog('[*] Erasing flash (this may take a moment)...', 'info');
        updateBrowserProgress(40, 'Erasing flash...');

        await bs.esploader.eraseFlash();

        updateBrowserProgress(100, 'Erase completed!');
        termLog('[OK] Flash erase completed successfully via Browser USB!', 'success');

        return true;

    } catch (err) {
        termLog(`[FAIL] Browser erase failed: ${err.message}`, 'error');
        updateBrowserProgress(0, 'Erase failed');
        return false;
    }
};

// ─── UI Helpers ─────────────────────────────────────────────────────────────

function updateBrowserDeviceBadge(connected, chipName = '') {
    const badge = document.getElementById('browser-device-badge');
    if (!badge) return;

    if (connected) {
        badge.innerHTML = `
            <i class="fa-solid fa-circle-check" style="color: var(--accent-green);"></i>
            <span>${chipName || 'ESP Device'} — Connected via Browser USB</span>`;
        badge.classList.add('connected');
    } else {
        badge.innerHTML = `
            <i class="fa-solid fa-circle-xmark"></i>
            <span>No device connected</span>`;
        badge.classList.remove('connected');
    }
}

function updateBrowserUSBStatus(connected, chipName = '', chipInfo = null) {
    const statusEl = document.getElementById('browser-usb-status');
    const connectBtn = document.getElementById('btn-browser-connect');
    const disconnectBtn = document.getElementById('btn-browser-disconnect');

    if (connected) {
        let infoHtml = '';
        if (chipInfo) {
            infoHtml = `
                <div class="browser-chip-info">
                    <div class="chip-info-row"><i class="fa-solid fa-microchip"></i> <strong>Chip:</strong> ${chipInfo.chip_type}</div>
                    <div class="chip-info-row"><i class="fa-solid fa-fingerprint"></i> <strong>MAC:</strong> ${chipInfo.mac_address}</div>
                    <div class="chip-info-row"><i class="fa-solid fa-hard-drive"></i> <strong>Flash:</strong> ${chipInfo.flash_size}</div>
                </div>`;
        }

        statusEl.innerHTML = `
            <div class="browser-connected-state">
                <div class="connected-icon pulse-green">
                    <i class="fa-solid fa-microchip"></i>
                </div>
                <div class="connected-text">
                    <strong>${chipName || 'ESP Device'}</strong>
                    <span>Connected via Browser USB</span>
                </div>
                ${infoHtml}
            </div>`;

        if (connectBtn) connectBtn.classList.add('hidden');
        if (disconnectBtn) disconnectBtn.classList.remove('hidden');
    } else {
        statusEl.innerHTML = `
            <div class="empty-state">
                <i class="fa-brands fa-usb"></i>
                <p>No device connected</p>
                <span>Click below to connect your ESP board</span>
            </div>`;

        if (connectBtn) connectBtn.classList.remove('hidden');
        if (disconnectBtn) disconnectBtn.classList.add('hidden');
    }
}

function updateBrowserProgress(percent, status) {
    const container = document.getElementById('progress-container');
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('progress-label');
    const pct = document.getElementById('progress-percent');

    if (!container) return;

    if (percent > 0) {
        container.classList.remove('hidden');
        fill.style.width = `${percent}%`;
        pct.textContent = `${percent}%`;
        label.textContent = status;

        if (percent === 100) {
            fill.style.background = 'linear-gradient(90deg, var(--accent-green), #16a34a)';
        } else if (percent === 0 && status.includes('fail')) {
            fill.style.background = 'linear-gradient(90deg, var(--accent-red), #dc2626)';
        } else {
            fill.style.background = 'linear-gradient(90deg, var(--accent-cyan), #06b6d4)';
        }
    }
}

function formatFlashSize(bytes) {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
    } else if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(0)}KB`;
    }
    return `${bytes}B`;
}

// ─── Auto-init ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    window.checkWebSerialSupport();
});
