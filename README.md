<p align="center">
  <img src="static/img/logo.png" alt="Esp Burner Logo" width="120">
</p>

<h1 align="center">Esp Burner</h1>

<p align="center">
  <strong>Professional ESP Board Flash Memory Eraser</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v1.0.0-FF6B35?style=for-the-badge&logo=semanticrelease&logoColor=white" alt="Version">
  <img src="https://img.shields.io/badge/python-3.8%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/flask-3.x-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask">
  <img src="https://img.shields.io/badge/esptool-4.x-E7352C?style=for-the-badge&logo=espressif&logoColor=white" alt="esptool">
  <img src="https://img.shields.io/badge/license-MIT-22C55E?style=for-the-badge" alt="License">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/developed%20by-MintFire-FF6B35?style=flat-square" alt="MintFire">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-00D4FF?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/WebSocket-realtime-A855F7?style=flat-square&logo=socketdotio&logoColor=white" alt="WebSocket">
</p>

---

## Overview

**Esp Burner** is a professional-grade, Flask-based web application designed for securely erasing flash memory on Espressif ESP microcontroller boards. Built with a premium dark-themed dashboard, real-time WebSocket communication, and advanced erase options, it provides an intuitive and powerful interface for hardware engineers, IoT developers, and embedded systems professionals.

> Developed by **MintFire** — Industrial-grade tooling for the embedded world.

---

## Features

### Core Functionality
| Feature | Description |
|---------|-------------|
| **Auto Port Detection** | Automatically detects and monitors USB serial ports in real-time |
| **ESP Board Identification** | Retrieves chip type, MAC address, flash size, crystal frequency, and feature set |
| **Full Flash Erase** | One-click complete flash memory wipe |
| **Region Erase** | Selective memory region erasure with hex address and size inputs |
| **Real-Time Terminal** | Live log streaming from esptool operations via WebSocket |
| **Progress Tracking** | Visual progress bar with status updates during erase operations |

### Advanced Options
- **Baud Rate Selection** — Choose from 9600 to 921600 baud
- **Before Reset Mode** — `default_reset`, `usb_reset`, `no_reset`, `no_reset_no_sync`
- **After Reset Mode** — `hard_reset`, `soft_reset`, `no_reset`, `no_reset_stub`
- **Confirmation Modal** — Safety confirmation with full operation summary before execution

### Dashboard
- **Stats Overview** — Ports detected, ESP devices found, connected chip type, flash size
- **Connected Ports Panel** — Live device list with manufacturer info, ESP detection badges, and connect buttons
- **Board Information Panel** — Detailed hardware specs after connection
- **Erase Control Panel** — Full/Region toggle, baud rate, advanced reset options
- **Live Terminal** — Timestamped, color-coded log output

### Design
- Premium **dark theme** with glassmorphism effects
- **Font Awesome 6** icons throughout (no emojis)
- **Inter** + **JetBrains Mono** typography
- Smooth **micro-animations** and hover effects
- Fully **responsive** layout for all screen sizes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.8+, Flask 3.x, Flask-SocketIO |
| **ESP Communication** | esptool 4.x, pyserial |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Real-Time** | Socket.IO (WebSocket) |
| **Async** | eventlet |
| **Icons** | Font Awesome 6 (CDN) |
| **Fonts** | Google Fonts (Inter, JetBrains Mono) |

---

## Project Structure

```
Esp Boot Burner/
├── app.py                      # Flask application entry point
├── requirements.txt            # Python dependencies
├── README.md                   # This file
├── static/
│   ├── css/
│   │   └── style.css           # Premium dark-theme stylesheet
│   ├── js/
│   │   └── main.js             # Frontend application logic
│   └── img/
│       ├── logo.png            # Esp Burner logo
│       └── favicon.png         # Browser favicon
└── templates/
    └── index.html              # Dashboard SPA template
```

---

## Installation

### Prerequisites

- **Python 3.8+** installed
- **pip** package manager
- **USB drivers** for your ESP board (CP210x, CH340, FTDI, etc.)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/mintfire/esp-burner.git
cd esp-burner

# 2. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Launch the application
python app.py
```

The dashboard will be available at **http://localhost:5000**

---

## Usage

### 1. Connect Your ESP Board
Plug your ESP board into a USB port. Esp Burner will automatically detect the device and display it in the **Connected Ports** panel.

### 2. Identify the Board
Click the **Connect** button next to your device to retrieve chip information (type, MAC, flash size, crystal).

### 3. Configure Erase Options
- Select **Full Erase** or **Region Erase** mode
- Choose your preferred **baud rate**
- Optionally expand **Advanced Options** to configure reset behavior

### 4. Execute Erase
Click **ERASE FLASH**, review the confirmation modal, and confirm. Monitor progress in real-time through the progress bar and live terminal.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serve the dashboard |
| `/api/ports` | GET | List available serial ports |
| `/api/board-info` | POST | Get ESP board information |
| `/api/erase` | POST | Start erase operation |
| `/api/status` | GET | Application status |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connected` | Server → Client | Connection confirmation |
| `ports_changed` | Server → Client | Port list updated |
| `erase_log` | Server → Client | Terminal log entry |
| `erase_progress` | Server → Client | Progress update |
| `erase_complete` | Server → Client | Operation finished |
| `request_ports` | Client → Server | Request port rescan |

---

## Supported ESP Boards

| Board | Chip | Status |
|-------|------|--------|
| ESP32 | ESP32 | ✅ Supported |
| ESP32-S2 | ESP32-S2 | ✅ Supported |
| ESP32-S3 | ESP32-S3 | ✅ Supported |
| ESP32-C3 | ESP32-C3 | ✅ Supported |
| ESP32-C6 | ESP32-C6 | ✅ Supported |
| ESP32-H2 | ESP32-H2 | ✅ Supported |
| ESP8266 | ESP8266 | ✅ Supported |
| ESP8285 | ESP8285 | ✅ Supported |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ESP_BURNER_HOST` | `0.0.0.0` | Server bind address |
| `ESP_BURNER_PORT` | `5000` | Server port |
| `ESP_BURNER_DEBUG` | `true` | Debug mode |

### Boot Mode

Most ESP boards require entering **download mode** for flash operations:
1. Hold the **BOOT** button
2. Press and release the **RESET** button
3. Release the **BOOT** button

> Some dev boards with auto-reset circuits (e.g., CP2102N) handle this automatically.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No ports detected | Install USB-to-UART drivers (CP210x / CH340 / FTDI) |
| Connection timeout | Put ESP board in download mode (hold BOOT + press RESET) |
| Permission denied (Linux) | Add user to `dialout` group: `sudo usermod -aG dialout $USER` |
| Erase fails | Try lower baud rate (115200) or different reset mode |
| Port busy | Close Arduino IDE, PlatformIO, or other serial monitors |

---

## Contributing

We welcome contributions from the community!

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'feat: add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Development Guidelines
- Follow PEP 8 for Python code
- Use semantic commit messages (`feat:`, `fix:`, `docs:`, `chore:`)
- Add docstrings to all public functions
- Test on at least one physical ESP board before submitting hardware-related changes

---

## Security

- This tool operates on **locally connected hardware only**
- No data is transmitted to external servers
- WebSocket communication is local (`localhost`)
- Flash erase operations require **explicit user confirmation**

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Espressif Systems](https://www.espressif.com/) — ESP chip manufacturer
- [esptool](https://github.com/espressif/esptool) — Official Espressif flash tool
- [Flask](https://flask.palletsprojects.com/) — Python micro web framework
- [Socket.IO](https://socket.io/) — Real-time bidirectional communication
- [Font Awesome](https://fontawesome.com/) — Icon library

---

<p align="center">
  <sub>Built with ❤️ by <strong>MintFire</strong> — © 2026 All rights reserved.</sub>
</p>
