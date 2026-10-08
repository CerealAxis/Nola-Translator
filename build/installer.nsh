; Layout: the program lives in an `App` subfolder so the `Data` folder beside it survives an
; upgrade. The uninstaller empties $INSTDIR on every update — atomicRMDir walks "$INSTDIR\*.*"
; (uninstaller.nsh) — so everything under $INSTDIR is disposable and everything beside it is not.
;
; <install root>\App  the program, $INSTDIR
; <install root>\Data user data

!define NOLA_APP_DIR_NAME "App"
!define NOLA_DATA_DIR_NAME "Data"

; Uninstaller prompt wording, as LangString with the LCID numbers electron-builder emits for its own
; message files (nsisLang.js). package.json sets no nsis.installerLanguages, so the build compiles
; the English entry alone; MUI2.nsh arrives later than this header, so bare numbers stand in for
; the ${LANG_*} constants it defines.
LangString nolaUninstallDeleteData 1033 "Also delete the Data folder? It holds your meetings, models and settings.$\r$\n$\r$\nChoose No to keep it."
LangString nolaUninstallKeepingData 1033 "Keeping the Data folder"
LangString nolaUninstallRemovingData 1033 "Removing the Data folder"

; A macro expanded into the page list contributes page declarations, not runnable code, so the path
; fix has to hang off a Function that NSIS calls at run time. The directory page cannot supply its
; own: MUI_PAGE_CUSTOMFUNCTION_PRE is taken by instFilesPre, and its own PRE/LEAVE pair would be
; overwritten by whatever the next page declares.
!ifndef BUILD_UNINSTALLER
Function nolaFixInstallDir
  ; The directory page yields the install root; the program needs its own subfolder under it. This
  ; also runs on an update, where $INSTDIR already ends in \App because it came from the registry,
  ; so the append is conditional or the path would gain one \App per upgrade.
  ; ${StdUtils.GetFileNamePart} rather than StrContains: NsisTarget includes StdUtils.nsh in the
  ; shared header, while StrContains.nsh only arrives later via assistedInstaller.nsh.
  ${StdUtils.GetFileNamePart} $0 "$INSTDIR"
  ${If} $0 != "${NOLA_APP_DIR_NAME}"
    StrCpy $INSTDIR "$INSTDIR\${NOLA_APP_DIR_NAME}"
  ${EndIf}
FunctionEnd

!macro customPageAfterChangeDir
  Page custom nolaFixInstallDir
!macroend
!endif

!macro customInstall
  ; $INSTDIR is already <root>\App at this point, so .. resolves to the install root.
  CreateDirectory "$INSTDIR\..\${NOLA_DATA_DIR_NAME}"
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
    RMDir /r "$INSTDIR\..\${NOLA_DATA_DIR_NAME}"
  ${EndIf}
!macroend
