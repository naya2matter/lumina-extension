; Inno Setup script — PNE LC AI (self-hosted Chrome extension) installer.
;
; Per-user install (NO admin required): drops the unpacked extension + the
; lc-updater native host into %LOCALAPPDATA%\PNE LC AI, registers the native
; messaging host under HKCU, and guides the user through a one-time
; "Load unpacked". The updater then keeps the extension current from our server.
;
; Build (on Windows, with Inno Setup 6 installed):
;   1. From the repo root:  npm run build           (produces dist\)
;   2. Build the updater:    updater\build.sh        (produces updater\bin\lc-updater.exe)
;   3. Compile this script:  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installers\windows\PNE-LC-AI.iss
;   Output: installers\windows\Output\PNE-LC-AI-Setup.exe

#define AppName "PNE LC AI"
#define AppVersion "1.0.0"
#define ExtensionId "glanidmlbocpbpihkbahamdipkkiiacb"

[Setup]
AppId={{7F1C4E20-9C1B-4F2E-9E2A-0F1A2B3C4D5E}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=PNE United
DefaultDirName={localappdata}\{#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=PNE-LC-AI-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
InfoAfterFile=POST_INSTALL.txt
UninstallDisplayName={#AppName}

[Files]
; The built extension (contents of dist\) -> {app}\extension
Source: "..\..\dist\*"; DestDir: "{app}\extension"; Flags: recursesubdirs createallsubdirs ignoreversion
; The native updater host
Source: "..\..\updater\bin\lc-updater.exe"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
; Register the native messaging host for Chrome (HKCU = no admin needed).
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\com.pneunited.lc_updater"; ValueType: string; ValueData: "{app}\com.pneunited.lc_updater.json"; Flags: uninsdeletekey

[Run]
; Optional final-page actions (checkboxes).
Filename: "{app}\extension"; Description: "Open the extension folder (needed for 'Load unpacked')"; Flags: postinstall shellexec nowait
Filename: "{code:GetChromePath}"; Parameters: "chrome://extensions"; Description: "Open Chrome's Extensions page"; Flags: postinstall nowait; Check: ChromeFound

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function GetChromePath(Param: string): string;
var
  Candidates: array[0..2] of string;
  I: Integer;
begin
  Result := '';
  Candidates[0] := ExpandConstant('{localappdata}\Google\Chrome\Application\chrome.exe');
  Candidates[1] := ExpandConstant('{pf}\Google\Chrome\Application\chrome.exe');
  Candidates[2] := ExpandConstant('{pf32}\Google\Chrome\Application\chrome.exe');
  for I := 0 to 2 do
    if FileExists(Candidates[I]) then
    begin
      Result := Candidates[I];
      Exit;
    end;
end;

function ChromeFound(): Boolean;
begin
  Result := GetChromePath('') <> '';
end;

// Write the native-messaging host manifest with the real, absolute path to the
// updater. JSON requires backslashes to be escaped, so double them.
procedure WriteHostManifest();
var
  Json, ExePath: string;
begin
  ExePath := ExpandConstant('{app}\lc-updater.exe');
  StringChangeEx(ExePath, '\', '\\', True);
  Json :=
    '{' + #13#10 +
    '  "name": "com.pneunited.lc_updater",' + #13#10 +
    '  "description": "PNE LC AI self-hosted updater",' + #13#10 +
    '  "path": "' + ExePath + '",' + #13#10 +
    '  "type": "stdio",' + #13#10 +
    '  "allowed_origins": [ "chrome-extension://{#ExtensionId}/" ]' + #13#10 +
    '}' + #13#10;
  SaveStringToFile(ExpandConstant('{app}\com.pneunited.lc_updater.json'), Json, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    WriteHostManifest();
end;
