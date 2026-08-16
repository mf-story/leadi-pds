@echo off
chcp 65001 >nul
title LeaDi-PDS Online (Cloudflare Tunnel)
cd /d "%~dp0"
echo =====================================================
echo   LeaDi-PDS - Akses Online (HTTPS via Cloudflare Tunnel)
echo =====================================================
echo Membuka 2 jendela: server Node + terowongan cloudflared.
echo Alamat publik https://xxxxx.trycloudflare.com akan tampil
echo di jendela "LeaDi-PDS Tunnel" (berubah tiap kali dijalankan).
echo.

REM 1) Jalankan server Node (port 8095)
start "LeaDi-PDS Server" cmd /k "cd /d "%~dp0" && node server.js"

REM 2) Cari cloudflared lalu buka terowongan
set "CF="
if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CF if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CF where cloudflared >nul 2>nul && set "CF=cloudflared"

if not defined CF (
  echo.
  echo cloudflared TIDAK ditemukan.
  echo Pasang dulu:  winget install Cloudflare.cloudflared
  echo lalu jalankan lagi berkas ini.
  pause
  exit /b
)

timeout /t 2 >nul
start "LeaDi-PDS Tunnel" cmd /k ""%CF%" tunnel --url http://localhost:8095"

echo.
echo Kedua jendela sudah dibuka. Biarkan keduanya tetap berjalan.
echo Bagikan alamat https://xxxxx.trycloudflare.com ke pengguna lain.
echo Tutup jendela untuk menghentikan.
