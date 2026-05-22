@echo off
chcp 65001 >nul
title AI 标签分类扩展 — 打包工具
echo ========================================
echo  AI 标签分类扩展 打包工具
echo ========================================
echo.
echo 正在打包，请稍候...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0package.ps1"

if %errorlevel% neq 0 (
    echo.
    echo !! 打包失败，请检查上方错误信息 !!
    pause
    exit /b %errorlevel%
)

pause
