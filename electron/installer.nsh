; Startup shortcut for kiosk — runs with Windows login
!macro customInstall
  CreateShortCut "$SMSTARTUP\screensmart.lnk" "$INSTDIR\screensmart Kiosk.exe" "" "$INSTDIR\screensmart Kiosk.exe" 0
!macroend

!macro customUnInstall
  Delete "$SMSTARTUP\screensmart.lnk"
!macroend
