@echo off
title Radar and Video Visualizer - Server
color 0B

cls
echo.
echo ======================================================
echo      Radar and Video Visualizer - Local Server
echo ======================================================
echo.
echo  - This window is your local web server.
echo  - Please KEEP THIS WINDOW OPEN while using the app.
echo  - To stop the server, simply close this window.
echo.
echo ======================================================
echo.

echo Launching the application in your default browser...
start http://127.0.0.1:8000/index.html

echo Server is now running on http://127.0.0.1:8000
echo Press CTRL+C at any time to stop the server.

:: Run the server command directly. We know 'python' works from our test.
python -m http.server 8000