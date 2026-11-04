; Blind Hub Windows इंस्टॉलर (Inno Setup). Windows की "Apps" सूची में दिखता है और वहीं से हटता है.
[Setup]
AppId={{6B1E2C7A-4D1F-4F7B-9A2E-B1A1D0C0A001}
AppName=Blind Hub
AppVersion=1.23
AppPublisher=Blind Indian Tech Support
AppPublisherURL=mailto:bits.headquarter505@gmail.com
DefaultDirName={autopf}\BlindHub
DefaultGroupName=Blind Hub
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=BlindHub-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Blind Hub
PrivilegesRequired=lowest

[Tasks]
Name: "desktopicon"; Description: "डेस्कटॉप पर शॉर्टकट बनाएँ"; GroupDescription: "अतिरिक्त काम:"

[Files]
Source: "dist\BlindHub.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Blind Hub"; Filename: "{app}\BlindHub.exe"
Name: "{autodesktop}\Blind Hub"; Filename: "{app}\BlindHub.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\BlindHub.exe"; Description: "Blind Hub अभी चलाएँ"; Flags: nowait postinstall skipifsilent
