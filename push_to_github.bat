@echo off
set "GIT_PATH=%LOCALAPPDATA%\GitHubDesktop\app-3.6.5\resources\app\git\cmd"
set "PATH=%GIT_PATH%;%PATH%"

echo ================================================================
echo  PUSHING TO GITHUB: https://github.com/tech-piyusheghe/HTH2.0-project.git
echo ================================================================
echo.

git push -u origin main

echo.
pause
