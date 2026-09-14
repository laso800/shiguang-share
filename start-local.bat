@echo off
rem 一键启动本地预览：双击本文件即可在浏览器打开网站
rem 依赖：电脑上已安装 Python
cd /d "%~dp0"
echo Opening http://localhost:8000/login.html
start "" http://localhost:8000/login.html
python -m http.server 8000