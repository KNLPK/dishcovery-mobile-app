/**
 * Base URL for the dishcovery-proxy Express server.
 *
 * Use your computer's LAN IP so a physical Android device on the same Wi-Fi
 * can reach the proxy. Find it on Windows with:
 *   ipconfig
 * Look for "IPv4 Address" under your active Wi-Fi adapter (e.g. 192.168.x.x).
 *
 * Android emulator: use http://10.0.2.2:3001
 * iOS simulator:    use http://localhost:3001
 */
export const API_BASE_URL = 'http://10.10.41.7:3001';
