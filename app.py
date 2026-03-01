"""
Esp Burner - Professional ESP Board Memory Eraser
Developed by MintFire | Version v1.0.0

A Flask-based web application for connecting to ESP boards
and erasing their flash memory with advanced options.
"""

# ─── Async Mode Auto-Detection ──────────────────────────────────────────────
# Try gevent first (best production support), then eventlet, then threading
ASYNC_MODE = None

try:
    from gevent import monkey
    monkey.patch_all()
    ASYNC_MODE = 'gevent'
except (ImportError, Exception):
    try:
        import eventlet
        eventlet.monkey_patch(os=True, select=True, socket=True, thread=True, time=True)
        ASYNC_MODE = 'eventlet'
    except (ImportError, AttributeError, Exception):
        ASYNC_MODE = 'threading'

import os
import sys
import json
import time
import threading
import subprocess
import io

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import serial.tools.list_ports

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24).hex()
socketio = SocketIO(app, cors_allowed_origins="*", async_mode=ASYNC_MODE)

# ─── Application Metadata ───────────────────────────────────────────────────
APP_NAME = "Esp Burner"
APP_VERSION = "v1.0.0"
APP_DEVELOPER = "MintFire"

# ─── State Management ───────────────────────────────────────────────────────
connected_port = None
board_info = {}
is_erasing = False
port_monitor_active = True


# ─── Helper Functions ────────────────────────────────────────────────────────

def get_serial_ports():
    """Scan and return all available serial ports with metadata."""
    ports = []
    for port in serial.tools.list_ports.comports():
        ports.append({
            'device': port.device,
            'name': port.name,
            'description': port.description,
            'manufacturer': port.manufacturer or 'Unknown',
            'hwid': port.hwid,
            'vid': f"0x{port.vid:04X}" if port.vid else None,
            'pid': f"0x{port.pid:04X}" if port.pid else None,
            'serial_number': port.serial_number or 'N/A',
            'is_esp': _is_likely_esp(port),
        })
    return ports


def _is_likely_esp(port):
    """Heuristic check if a port is likely an ESP device."""
    esp_keywords = ['cp210', 'ch340', 'ch9102', 'ftdi', 'silicon labs',
                    'wch', 'espressif', 'uart']
    desc_lower = (port.description or '').lower()
    mfr_lower = (port.manufacturer or '').lower()
    hwid_lower = (port.hwid or '').lower()
    combined = f"{desc_lower} {mfr_lower} {hwid_lower}"
    return any(kw in combined for kw in esp_keywords)


def _run_esptool_command(args, timeout=30):
    """Run an esptool command using subprocess and return output."""
    cmd = [sys.executable, '-m', 'esptool'] + args
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=os.environ.copy()
        )
        return {
            'stdout': result.stdout,
            'stderr': result.stderr,
            'output': result.stdout + '\n' + result.stderr,
            'returncode': result.returncode,
            'success': result.returncode == 0
        }
    except subprocess.TimeoutExpired:
        return {
            'stdout': '', 'stderr': 'Command timed out',
            'output': 'Command timed out', 'returncode': -1, 'success': False
        }
    except Exception as e:
        return {
            'stdout': '', 'stderr': str(e),
            'output': str(e), 'returncode': -1, 'success': False
        }


def _wait_for_port_release(port_device, max_retries=5, delay=1.5):
    """Wait until the serial port is available (not busy)."""
    import serial
    for attempt in range(max_retries):
        try:
            s = serial.Serial(port_device, 115200, timeout=1)
            s.close()
            return True  # Port is free
        except (serial.SerialException, OSError):
            socketio.emit('erase_log', {
                'message': f'[*] Port busy, waiting... (attempt {attempt + 1}/{max_retries})',
                'type': 'warning'
            })
            socketio.sleep(delay)
    return False  # Port still busy after retries


def get_board_info(port_device, baud_rate=115200):
    """Retrieve ESP board information using esptool."""
    info = {
        'chip_type': 'Unknown',
        'mac_address': 'Unknown',
        'flash_size': 'Unknown',
        'crystal': 'Unknown',
        'features': [],
        'stub_running': False,
    }

    try:
        # Get chip_id
        result = _run_esptool_command([
            '--port', port_device,
            '--baud', str(baud_rate),
            'chip_id'
        ], timeout=15)

        output = result['output']

        for line in output.split('\n'):
            line_stripped = line.strip()
            if 'Chip is' in line_stripped:
                info['chip_type'] = line_stripped.split('Chip is')[-1].strip()
            elif 'MAC:' in line_stripped:
                info['mac_address'] = line_stripped.split('MAC:')[-1].strip()
            elif 'Crystal is' in line_stripped:
                info['crystal'] = line_stripped.split('Crystal is')[-1].strip()
            elif 'Features:' in line_stripped:
                info['features'] = [f.strip() for f in
                                    line_stripped.split('Features:')[-1].split(',')]
            elif 'Stub is already running' in line_stripped or 'Uploading stub' in line_stripped:
                info['stub_running'] = True

        # Get flash_id
        result2 = _run_esptool_command([
            '--port', port_device,
            '--baud', str(baud_rate),
            'flash_id'
        ], timeout=15)

        output2 = result2['output']
        for line in output2.split('\n'):
            if 'flash size' in line.lower() or 'Detected flash size' in line:
                parts = line.strip().split(':')
                if len(parts) > 1:
                    info['flash_size'] = parts[-1].strip()
                else:
                    for token in line.strip().split():
                        if 'MB' in token or 'KB' in token:
                            info['flash_size'] = token
                            break

    except Exception as e:
        info['error'] = str(e)

    return info


def erase_flash_task(port_device, baud_rate=115200, erase_mode='full',
                     start_addr=0, size=0, before_reset='default_reset',
                     after_reset='hard_reset'):
    """Erase ESP flash memory — runs as a socketio background task."""
    global is_erasing
    is_erasing = True

    try:
        # Wait for the serial port to be released from any prior connection
        socketio.emit('erase_log', {
            'message': f'[*] Checking port availability on {port_device}...',
            'type': 'info'
        })
        socketio.emit('erase_progress', {'progress': 5, 'status': 'connecting'})
        socketio.sleep(2)  # Give OS time to release the port

        if not _wait_for_port_release(port_device):
            socketio.emit('erase_log', {
                'message': f'[FAIL] Port {port_device} is still busy. Please disconnect other serial monitors or re-plug the device.',
                'type': 'error'
            })
            socketio.emit('erase_progress', {'progress': 0, 'status': 'failed'})
            socketio.emit('erase_complete', {
                'success': False,
                'message': f'Port {port_device} is busy'
            })
            return

        socketio.emit('erase_log', {
            'message': f'[OK] Port {port_device} is available',
            'type': 'success'
        })

        # Build the esptool arguments
        args = [
            '--port', port_device,
            '--baud', str(baud_rate),
            '--before', before_reset,
            '--after', after_reset,
        ]

        if erase_mode == 'full':
            args.append('erase_flash')
            socketio.emit('erase_log', {
                'message': f'[CMD] Erasing entire flash memory on {port_device}...',
                'type': 'info'
            })
        elif erase_mode == 'region':
            args.extend(['erase_region', str(start_addr), str(size)])
            socketio.emit('erase_log', {
                'message': f'[CMD] Erasing region: start=0x{start_addr:X}, size={size} bytes on {port_device}...',
                'type': 'info'
            })

        full_cmd = [sys.executable, '-m', 'esptool'] + args
        socketio.emit('erase_log', {
            'message': f'[CMD] $ {" ".join(full_cmd)}',
            'type': 'command'
        })
        socketio.emit('erase_progress', {'progress': 15, 'status': 'connecting'})
        socketio.sleep(0.1)

        # Run esptool with subprocess.run (blocking, but in background task it's fine)
        result = _run_esptool_command(args, timeout=120)

        socketio.emit('erase_progress', {'progress': 50, 'status': 'erasing'})
        socketio.sleep(0.1)

        # Stream output lines to terminal
        all_output = result['output']
        lines = [l.strip() for l in all_output.split('\n') if l.strip()]

        for line in lines:
            log_type = 'info'
            if 'error' in line.lower() or 'failed' in line.lower():
                log_type = 'error'
            elif 'warning' in line.lower():
                log_type = 'warning'
            elif 'success' in line.lower() or 'done' in line.lower() or 'completed' in line.lower():
                log_type = 'success'

            socketio.emit('erase_log', {
                'message': f'[ESP] {line}',
                'type': log_type
            })
            socketio.sleep(0.05)

        if result['success']:
            socketio.emit('erase_progress', {'progress': 100, 'status': 'completed'})
            socketio.emit('erase_log', {
                'message': '[OK] Flash erase completed successfully!',
                'type': 'success'
            })
            socketio.emit('erase_complete', {
                'success': True,
                'message': 'Flash erased successfully'
            })
        else:
            socketio.emit('erase_progress', {'progress': 0, 'status': 'failed'})
            socketio.emit('erase_log', {
                'message': f'[FAIL] Erase failed (exit code {result["returncode"]})',
                'type': 'error'
            })
            if result['stderr'].strip() and result['stderr'].strip() != result['stdout'].strip():
                for err_line in result['stderr'].strip().split('\n'):
                    if err_line.strip():
                        socketio.emit('erase_log', {
                            'message': f'[ERR] {err_line.strip()}',
                            'type': 'error'
                        })
                        socketio.sleep(0.05)
            socketio.emit('erase_complete', {
                'success': False,
                'message': f'Erase failed. Exit code: {result["returncode"]}'
            })

    except Exception as e:
        socketio.emit('erase_log', {
            'message': f'[FAIL] Exception: {str(e)}',
            'type': 'error'
        })
        socketio.emit('erase_complete', {
            'success': False,
            'message': str(e)
        })
    finally:
        is_erasing = False


def port_monitor():
    """Background task to monitor serial port changes."""
    known_ports = set()
    while port_monitor_active:
        try:
            current_ports = {p.device for p in serial.tools.list_ports.comports()}
            added = current_ports - known_ports
            removed = known_ports - current_ports

            if added or removed:
                known_ports = current_ports
                socketio.emit('ports_changed', {
                    'ports': get_serial_ports(),
                    'added': list(added),
                    'removed': list(removed),
                })

                for p in added:
                    socketio.emit('erase_log', {
                        'message': f'[+] Device connected: {p}',
                        'type': 'success'
                    })
                for p in removed:
                    socketio.emit('erase_log', {
                        'message': f'[-] Device disconnected: {p}',
                        'type': 'warning'
                    })

            elif not known_ports:
                known_ports = current_ports

            socketio.sleep(2)
        except Exception:
            socketio.sleep(5)


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    """Serve the main dashboard."""
    return render_template('index.html',
                           app_name=APP_NAME,
                           app_version=APP_VERSION,
                           app_developer=APP_DEVELOPER)


@app.route('/api/ports')
def api_ports():
    """Return list of available serial ports."""
    ports = get_serial_ports()
    return jsonify({
        'success': True,
        'ports': ports,
        'count': len(ports)
    })


@app.route('/api/board-info', methods=['POST'])
def api_board_info():
    """Get ESP board information for a given port."""
    global connected_port, board_info
    data = request.get_json()
    port_device = data.get('port')
    baud_rate = data.get('baud_rate', 115200)

    if not port_device:
        return jsonify({'success': False, 'error': 'No port specified'}), 400

    socketio.emit('erase_log', {
        'message': f'[*] Connecting to {port_device} at {baud_rate} baud...',
        'type': 'info'
    })

    info = get_board_info(port_device, baud_rate)

    if 'error' in info:
        socketio.emit('erase_log', {
            'message': f'[FAIL] Failed to get board info: {info["error"]}',
            'type': 'error'
        })
        return jsonify({'success': False, 'error': info['error']}), 500

    connected_port = port_device
    board_info = info

    socketio.emit('erase_log', {
        'message': f'[OK] Connected to {info.get("chip_type", "Unknown")} on {port_device}',
        'type': 'success'
    })

    return jsonify({'success': True, 'info': info})


@app.route('/api/erase', methods=['POST'])
def api_erase():
    """Start an erase operation."""
    global is_erasing
    if is_erasing:
        return jsonify({'success': False, 'error': 'An erase operation is already in progress'}), 409

    data = request.get_json()
    port_device = data.get('port')
    baud_rate = int(data.get('baud_rate', 115200))
    erase_mode = data.get('erase_mode', 'full')
    start_addr = int(data.get('start_addr', '0'), 0)
    size = int(data.get('size', '0'), 0)
    before_reset = data.get('before_reset', 'default_reset')
    after_reset = data.get('after_reset', 'hard_reset')

    if not port_device:
        return jsonify({'success': False, 'error': 'No port specified'}), 400

    if erase_mode == 'region' and size <= 0:
        return jsonify({'success': False, 'error': 'Invalid region size'}), 400

    # Use socketio.start_background_task for proper async support
    socketio.start_background_task(
        erase_flash_task,
        port_device, baud_rate, erase_mode, start_addr, size,
        before_reset, after_reset
    )

    return jsonify({'success': True, 'message': 'Erase operation started'})


@app.route('/api/status')
def api_status():
    """Return current application status."""
    return jsonify({
        'app_name': APP_NAME,
        'version': APP_VERSION,
        'developer': APP_DEVELOPER,
        'is_erasing': is_erasing,
        'connected_port': connected_port,
        'board_info': board_info,
        'async_mode': ASYNC_MODE,
    })


# ─── WebSocket Events ────────────────────────────────────────────────────────

@socketio.on('connect')
def handle_connect():
    """Handle client WebSocket connection."""
    emit('connected', {
        'message': 'Connected to Esp Burner server',
        'version': APP_VERSION,
    })
    emit('ports_changed', {
        'ports': get_serial_ports(),
        'added': [],
        'removed': [],
    })
    emit('erase_log', {
        'message': f'[*] Esp Burner {APP_VERSION} — Ready',
        'type': 'info'
    })


@socketio.on('request_ports')
def handle_request_ports():
    """Client requests port scan."""
    emit('ports_changed', {
        'ports': get_serial_ports(),
        'added': [],
        'removed': [],
    })


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client WebSocket disconnection."""
    pass


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"""
    ╔══════════════════════════════════════════════╗
    ║         Esp Burner {APP_VERSION}                  ║
    ║         Developed by {APP_DEVELOPER}              ║
    ║                                              ║
    ║  Dashboard: http://localhost:{port}             ║
    ║  Async Mode: {ASYNC_MODE:<20}           ║
    ╚══════════════════════════════════════════════╝
    """)

    # Start port monitoring as a socketio background task
    socketio.start_background_task(port_monitor)

    socketio.run(app, host='0.0.0.0', port=port, debug=False,
                 use_reloader=False, log_output=True)
