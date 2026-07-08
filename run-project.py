import os
import sys
import socket
import subprocess
import time

# Force console output to be utf-8 to support emojis if possible, but keep characters safe
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def print_banner():
    print("=" * 60)
    print("      *** Bellagio Inventory System - Smart Launcher ***      ")
    print("=" * 60)

def main():
    print_banner()
    
    # 1. Get PC's Local IP Address
    local_ip = get_local_ip()
    frontend_url = f"http://{local_ip}:5173"
    backend_url = f"http://{local_ip}:8000"
    
    print(f"\n[+] Local IP Detected: {local_ip}")
    print(f"[+] Frontend Link: {frontend_url}")
    print(f"[+] Backend API Link: {backend_url}")
    print("-" * 60)
    
    # 2. Generate and print QR Code for iPhone
    try:
        import qrcode
        print("\n[!] Scan this QR code with your iPhone to open the app directly:")
        print("   (Ensure your iPhone is connected to the same Wi-Fi network)\n")
        qr = qrcode.QRCode(version=1, box_size=1, border=2)
        qr.add_data(frontend_url)
        qr.make(fit=True)
        # print_ascii with invert=True is typically best for white-on-black consoles
        qr.print_ascii(invert=True)
    except ImportError:
        print("\n[!] Warning: 'qrcode' module not found in python. QR Code cannot be generated.")
        print("Please open the link manually on your iPhone.")
    
    print("-" * 60)
    print("Remote Sharing (External Tunnel):")
    print("To open the app from outside your Wi-Fi network (e.g. 4G/5G Cellular Data),")
    print("open a new terminal/command prompt and run:")
    print("-> ssh -R 80:localhost:5173 a.pinggy.link")
    print("-" * 60)
    
    print("\n[i] Launching Backend Server and Frontend Server...")
    
    # Paths
    current_dir = os.path.dirname(os.path.abspath(__file__))
    venv_python = os.path.join(current_dir, "venv", "Scripts", "python.exe")
    
    # 3. Launch Backend in a new CMD window
    print("[+] Starting Backend API Server (Port 8000)...")
    if os.path.exists(venv_python):
        backend_cmd = f'start "Bellagio Inventory System - Backend API" "{venv_python}" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload'
    else:
        backend_cmd = 'start "Bellagio Inventory System - Backend API" uvicorn main:app --host 0.0.0.0 --port 8000 --reload'
    subprocess.Popen(backend_cmd, shell=True)
    
    # 4. Launch Frontend in a new CMD window
    print("[+] Starting Frontend Dev Server (Port 5173)...")
    frontend_dir = os.path.join(current_dir, "frontend")
    frontend_cmd = 'start "Bellagio Inventory System - Frontend Vite" cmd /c npm run dev -- --host'
    subprocess.Popen(frontend_cmd, shell=True, cwd=frontend_dir)
    
    print("\n[+] Both servers started in separate windows!")
    print("Keep this window open to scan the QR code anytime.")
    print("Press Ctrl+C here or close this window to exit.")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nExiting Launcher...")

if __name__ == "__main__":
    main()
