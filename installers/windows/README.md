# Windows installer (Inno Setup)

Produces `PNE-LC-AI-Setup.exe` — a **per-user, no-admin** installer that:

- copies the built extension to `%LOCALAPPDATA%\PNE LC AI\extension`
- copies `lc-updater.exe` to `%LOCALAPPDATA%\PNE LC AI\`
- writes the native-messaging host manifest with the correct absolute path
- registers it under `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.pneunited.lc_updater`
- shows a final page guiding the one-time **Load unpacked**

## Build

Requires a Windows machine (or Wine) with [Inno Setup 6](https://jrsoftware.org/isdl.php).

```bat
:: from the repo root
npm install
npm run build                     :: -> dist\
bash updater\build.sh             :: -> updater\bin\lc-updater.exe  (or build on any OS)

:: compile the installer
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installers\windows\PNE-LC-AI.iss
:: -> installers\windows\Output\PNE-LC-AI-Setup.exe
```

`updater\bin\lc-updater.exe` is produced by `updater/build.sh` and can be
cross-compiled from macOS/Linux (`GOOS=windows`). Only the Inno compile step
needs Windows.

## Code signing (recommended)

Unsigned, the installer triggers a SmartScreen "unknown publisher" warning.
Sign `lc-updater.exe` and the final `PNE-LC-AI-Setup.exe` with an OV/EV
Authenticode certificate:

```bat
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 ^
  /f cert.pfx /p <password> updater\bin\lc-updater.exe
:: then compile, and sign the resulting Setup.exe the same way.
```

Inno can also sign automatically via a `SignTool` directive if you configure a
signer in the IDE.

## Uninstall

Uninstalling removes the files, the updater, and the HKCU registration. It does
**not** remove the extension from Chrome — the user removes "PNE LC AI" from
`chrome://extensions` themselves.
