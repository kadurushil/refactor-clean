@echo off
title Python Installation Diagnostic

echo =================================================================
echo  This script will test your Python installation.
echo  The window will PAUSE at the end. Please copy the output.
echo =================================================================
echo.

echo --- 1. Testing for the 'python' command... ---
python --version
echo.

echo --- 2. Testing for the 'python3' command... ---
python3 --version
echo.

echo --- 3. Testing for the 'py' command... ---
py --version
echo.

echo =================================================================
echo  DIAGNOSTIC FINISHED. Please analyze the results above.
echo =================================================================
echo.
echo If you see a version number (e.g., Python 3.12.4) next to
echo one or more of the commands, that is the command we need to use.
echo.
echo If you see "'python' is not recognized..." for ALL of them,
echo it means Python was installed without being added to the system PATH.
echo.
echo Please copy ALL the text from this window and send it to me.
echo.

pause