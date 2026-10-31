@echo off
rem Double-click install (real mode, registers with Claude Code). Extra args are passed to scripts\install.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" -RegisterClaude %*
pause
