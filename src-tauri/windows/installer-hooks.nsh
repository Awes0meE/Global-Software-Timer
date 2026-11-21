; Tauri NSIS installer hooks for Global Software Timer.
;
; Backlog N18: after an in-place upgrade Windows kept showing the old app icon
; on the taskbar button. The taskbar follows the Start-menu shortcut (matched by
; AppUserModelID), whose IconLocation was implicit (",0" = target exe), and
; Explorer kept serving a stale cached icon for it. Writing the icon location
; explicitly as "<full exe path>,0" and notifying the shell refreshes it.
;
; NSIS_HOOK_POSTINSTALL runs at the end of the template's `Section Install`,
; after the Start-menu shortcut is created/migrated (and after the desktop
; shortcut for silent/passive installs). In an interactive install the finish
; page's desktop-shortcut checkbox (CreateOrUpdateDesktopShortcut) runs later and
; re-creates $DESKTOP\<product>.lnk with the implicit icon, overwriting this fix.
; So only the Start-menu shortcut and the taskbar pin (the ones the taskbar
; button follows) are guaranteed an explicit icon; the desktop shortcut keeps it
; only in /UPDATE mode or silent/passive installs.
;
; The shortcut is edited in place (IPersistFile::Load -> SetIconLocation ->
; Save), so the AppUserModelID property set by the template's
; SetLnkAppUserModelId is preserved. Shortcuts that do not exist or do not point
; at our exe are left untouched. Per-user paths only; no admin rights, no network.

!define /ifndef GST_SHCNE_UPDATEITEM 0x00002000
!define /ifndef GST_SHCNE_ASSOCCHANGED 0x08000000
!define /ifndef GST_SHCNF_IDLIST 0x0000
!define /ifndef GST_SHCNF_PATHW 0x0005

; Set an explicit icon location on `shortcut` if it exists and targets `target`,
; then tell the shell the shortcut changed. Clobbers $0-$3.
!macro GST_RefreshShortcutIcon shortcut target
  ${If} ${FileExists} "${shortcut}"
    !insertmacro IsShortcutTarget "${shortcut}" "${target}"
    Pop $3
    ${If} $3 = 1
      !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
      ${If} $0 P<> 0
        ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}",.r1)'
        ${If} $1 P<> 0
          ${IPersistFile::Load} $1 '("${shortcut}", ${STGM_READWRITE})'
          ${IShellLink::SetIconLocation} $0 '("${target}", 0)'
          ${IPersistFile::Save} $1 '("${shortcut}",1)'
          ${IUnknown::Release} $1 ""
        ${EndIf}
        ${IUnknown::Release} $0 ""
      ${EndIf}
      System::Call 'shell32::SHChangeNotify(i ${GST_SHCNE_UPDATEITEM}, i ${GST_SHCNF_PATHW}, w "${shortcut}", p 0)'
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  Push $1
  Push $2
  Push $3

  !if "${STARTMENUFOLDER}" != ""
    !insertmacro GST_RefreshShortcutIcon "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !endif
  !insertmacro GST_RefreshShortcutIcon "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro GST_RefreshShortcutIcon "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ; A taskbar pin made by the user is a shell-owned copy of the shortcut.
  !insertmacro GST_RefreshShortcutIcon "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"

  ; The exe itself changed: drop its cached icon, then flush association/icon caches.
  System::Call 'shell32::SHChangeNotify(i ${GST_SHCNE_UPDATEITEM}, i ${GST_SHCNF_PATHW}, w "$INSTDIR\${MAINBINARYNAME}.exe", p 0)'
  System::Call 'shell32::SHChangeNotify(i ${GST_SHCNE_ASSOCCHANGED}, i ${GST_SHCNF_IDLIST}, p 0, p 0)'

  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
