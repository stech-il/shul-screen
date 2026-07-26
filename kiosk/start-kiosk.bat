@echo off
rem ===== מסך בית כנסת - הפעלת קיוסק =====
rem העתק קובץ זה למחשב המסך, ושים קיצור דרך אליו ב- shell:startup
rem החלף את SHUL_ID במזהה בית הכנסת (מקודד URL) אם צריך.

rem "קהילת-מרכז-עמישב" מקודד. %% הוא סימן אחוז אחד בקובץ bat.
set "SHUL_ID=%%D7%%A7%%D7%%94%%D7%%99%%D7%%9C%%D7%%AA-%%D7%%9E%%D7%%A8%%D7%%9B%%D7%%96-%%D7%%A2%%D7%%9E%%D7%%99%%D7%%A9%%D7%%91"
set "URL=https://shul-screen.onrender.com/#/display/%SHUL_ID%?kiosk=1"

rem פרופיל נפרד = תהליך Chrome נפרד, אחרת דגלי הקיוסק לא נתפסים
set "PROFILE=%LOCALAPPDATA%\ShulKiosk"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

rem השהיה קצרה כדי לאפשר לרשת לעלות אחרי הדלקת המחשב
timeout /t 15 /nobreak >nul

start "" "%CHROME%" --kiosk --start-fullscreen --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --disable-infobars --autoplay-policy=no-user-gesture-required "%URL%"
