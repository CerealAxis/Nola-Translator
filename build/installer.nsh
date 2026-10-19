; Layout: the program lives in an `App` subfolder, while app data lives in the per-user install
; root. The uninstaller empties $INSTDIR on every update — atomicRMDir walks "$INSTDIR\*.*"
; (uninstaller.nsh) — so app data is kept outside the program folder.
;
; <install root>\App  the program, $INSTDIR
; %LOCALAPPDATA%\Programs\<product> app data
;
; The data folder is %LOCALAPPDATA%\Programs\<product>, which is the folder the app resolves at
; runtime. It is not derived from $INSTDIR, because the app writes its models, runtimes and
; settings there, while a program installed under C:\Program Files belongs to the installer,
; not to the user who runs the app.

!define NOLA_APP_DIR_NAME "App"
!define NOLA_DATA_DIR_NAME "Data"

; The data root is %LOCALAPPDATA%\Programs\<product>, which the app resolves at runtime.
; The per-user context is selected explicitly where it is used: a machine-wide install runs with
; the all-users context, whose LOCALAPPDATA belongs to the installing account.
!define NOLA_DATA_ROOT "$LOCALAPPDATA\Programs\${APP_FILENAME}"

; Keep these entries aligned with nsis.installerLanguages in package.json. electron-builder
; otherwise enables all bundled languages, and missing LangStrings fail compilation with -WX.
; LCIDs match electron-builder's nsisLang.js; MUI2.nsh and its LANG_* constants arrive later.
LangString nolaUninstallDeleteData 1033 "Also delete the Data folder? It holds your meetings, models and settings.$\r$\n$\r$\nChoose No to keep it."
LangString nolaUninstallKeepingData 1033 "Keeping the Data folder"
LangString nolaUninstallRemovingData 1033 "Removing the Data folder"
LangString nolaUninstallDeleteData 2052 "是否同时删除 Data 文件夹？其中包含你的会议记录、模型和设置。$\r$\n$\r$\n选择“否”可保留这些数据。"
LangString nolaUninstallKeepingData 2052 "正在保留 Data 文件夹"
LangString nolaUninstallRemovingData 2052 "正在删除 Data 文件夹"

!ifndef BUILD_UNINSTALLER
!include "FileFunc.nsh"
!include "LogicLib.nsh"

Var NolaExistingInstallDir

; Own the directory page so the assisted template does not generate its product-name sanitizer.
; Restore its flag after declaring our page; later shortcut handling still needs the option.
!ifdef allowToChangeInstallationDirectory
  !define NOLA_DIRECTORY_PAGE
  !undef allowToChangeInstallationDirectory
!endif

Function nolaFixInstallDir
  ${If} $NolaExistingInstallDir != ""
    ; Keep the registered executable directory unchanged when this is an upgrade.
    StrCpy $INSTDIR $NolaExistingInstallDir
  ${Else}
    ; Fresh selections use the chosen parent as the install root.
    Push $0
    ${GetFileName} "$INSTDIR" $0
    ${If} $0 != "${NOLA_APP_DIR_NAME}"
      StrCpy $INSTDIR "$INSTDIR\${NOLA_APP_DIR_NAME}"
    ${EndIf}
    Pop $0
  ${EndIf}
FunctionEnd

!macro customInit
  StrCpy $NolaExistingInstallDir ""
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" nolaExistingInstallFound
  Goto nolaExistingInstallChecked
  nolaExistingInstallFound:
  StrCpy $NolaExistingInstallDir "$INSTDIR"
  nolaExistingInstallChecked:
!macroend

!macro customPageAfterChangeDir
  !ifdef NOLA_DIRECTORY_PAGE
    !insertmacro skipPageIfUpdated
    !insertmacro MUI_PAGE_DIRECTORY
    !define allowToChangeInstallationDirectory
  !endif
  ; MUI_PAGE_INSTFILES consumes this callback immediately after the hook. Finalize the path once,
  ; without a custom page that mutates it on Back or a sanitizer that appends APP_FILENAME.
  !define MUI_PAGE_CUSTOMFUNCTION_PRE nolaFixInstallDir
!macroend
!endif

!macro customInstall
  ; The app resolves its data root here, so the folder has to exist before the first launch.
  ${If} $installMode == "all"
    SetShellVarContext current
  ${EndIf}
  CreateDirectory "${NOLA_DATA_ROOT}"
  ${If} $installMode == "all"
    SetShellVarContext all
  ${EndIf}
  !ifdef ZIP_COMPRESSION
    !ifndef APP_BUILD_DIR
      ; Extraction has finished; release the embedded payload before the finish page.
      ; NSIS removes the remaining plugin temporary directory when the installer exits.
      Delete "$PLUGINSDIR\app-$packageArch.zip"
    !endif
  !endif
!macroend

; Declared here rather than with LogicLib's ${Var}: the uninstaller build does not pull in the whole
; LogicLib rule set. A plain NSIS Var is what the surrounding templates use as well.
!ifdef BUILD_UNINSTALLER
Var /GLOBAL NolaDeleteData
!endif

!macro customUnInstall
  ; ${isUpdated} is how the uninstaller tells a newer installer's run apart from the user's own
  ; (installUtil.nsh passes --updated). The updater runs it with /S, where a prompt would stall an
  ; unattended update; a user-driven silent uninstall has nobody to answer either. Both keep Data,
  ; so the prompt is reserved for an interactive uninstall.
  ${If} ${isUpdated}
    StrCpy $NolaDeleteData "0"
  ${ElseIf} ${Silent}
    StrCpy $NolaDeleteData "0"
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION "$(nolaUninstallDeleteData)" /SD IDYES IDYES nolaDataDelete
    DetailPrint "$(nolaUninstallKeepingData)"
    StrCpy $NolaDeleteData "0"
    Goto nolaDataDecisionMade
    nolaDataDelete:
    DetailPrint "$(nolaUninstallRemovingData)"
    StrCpy $NolaDeleteData "1"
    nolaDataDecisionMade:
  ${EndIf}

  ${If} $NolaDeleteData == "1"
    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}
    RMDir /r "${NOLA_DATA_ROOT}"
    ; An install from the era when the data sat beside the program still has it there.
    RMDir /r "$INSTDIR\..\${NOLA_DATA_DIR_NAME}"
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
!macroend
