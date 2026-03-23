@echo off
:: Force the working directory to be the folder containing this script
cd /d "%~dp0"

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
:: Delay the browser launch by 2 seconds to allow the Python server to start up
start /b "" cmd /c "timeout /t 2 /nobreak > nul && start http://127.0.0.1:8000/index.html"

echo Server is starting on http://127.0.0.1:8000
echo Press CTRL+C at any time to stop the server.
echo.

:: Detect python and run server.py
python server.py || py server.py || python3 server.py || (
    echo.
    echo ERROR: Could not start Python server. 
    echo Check if Python is installed and in your PATH.
    pause
)