@echo off
setlocal
cd /d "%~dp0"
set "REPO=smartboyhacker66-stack/blind-"
set "NEWKEY=no"
echo Blind Hub push. Please wait.

where git >nul 2>&1
if errorlevel 1 (echo Error. Git is not installed. & goto fail)

if exist upload.jks goto haskey
where keytool >nul 2>&1
if errorlevel 1 (echo Error. Java is not installed. Install JDK 17, then run again. & goto fail)
echo Release key not found. Creating it now.
for /f %%P in ('powershell -NoProfile -Command "-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 20 | ForEach-Object {[char]$_})"') do set "PASS=%%P"
keytool -genkeypair -keystore upload.jks -alias blindhub -keyalg RSA -keysize 2048 -validity 10000 -storepass %PASS% -keypass %PASS% -dname "CN=Blind Indian Tech Support, O=Blind Indian Tech Support, C=IN" >nul 2>&1
if errorlevel 1 (echo Error. Key creation failed. & goto fail)
certutil -encode -f upload.jks upload_b64.tmp >nul
findstr /v /c:"-----" upload_b64.tmp > keystore_base64.txt
del upload_b64.tmp
> keystore_info.txt echo KEYSTORE_PASSWORD=%PASS%
>> keystore_info.txt echo KEY_PASSWORD=%PASS%
>> keystore_info.txt echo KEY_ALIAS=blindhub
set "NEWKEY=yes"
echo Key created. Keep the files upload.jks and keystore_info.txt safe. Never share them.
:haskey

git init -q
git add .
git config user.name >nul 2>&1 || git config user.name "BlindHub"
git config user.email >nul 2>&1 || git config user.email "blindhub@users.noreply.github.com"
git commit -q -m "Blind Hub update" >nul 2>&1
git branch -M main
git remote remove origin >nul 2>&1
git remote add origin https://github.com/%REPO%.git
echo Pushing to GitHub.
git push -q -u origin main --force
if errorlevel 1 (echo Error. Push failed. Check your GitHub login. & goto fail)
echo Push done.
for /f %%S in ('git rev-parse HEAD') do set "SHA=%%S"
set "MODE=push"

if not exist keystore_base64.txt goto build
where gh >nul 2>&1
if errorlevel 1 goto manual
gh auth status >nul 2>&1
if errorlevel 1 goto manual
if "%NEWKEY%"=="no" goto build
echo Saving the four secrets in GitHub.
gh secret set KEYSTORE_BASE64 --repo %REPO% < keystore_base64.txt
for /f "tokens=1,* delims==" %%A in (keystore_info.txt) do gh secret set %%A --repo %REPO% --body "%%B"
echo Secrets saved.
echo The first build started before the secrets existed, so starting a new signed build.
set "OLDID="
for /f %%R in ('gh run list --repo %REPO% --workflow build.yml --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId // empty" 2^>nul') do set "OLDID=%%R"
gh workflow run build.yml --repo %REPO% --ref main
if errorlevel 1 goto build
set "MODE=dispatch"
goto build

:manual
if "%NEWKEY%"=="no" goto build
clip < keystore_base64.txt
echo Key text copied to the clipboard.
echo Open GitHub, your repository, Settings, Secrets and variables, Actions.
echo Add secret KEYSTORE_BASE64 and paste. Then add the other three from keystore_info.txt.

:build
echo GitHub is now building the exe, the apk, the aab and the msix.
where gh >nul 2>&1
if errorlevel 1 goto nogh
gh auth status >nul 2>&1
if errorlevel 1 goto nogh

for /f "delims=" %%D in ('powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"') do set "DESK=%%D"
set "PKG=%DESK%\Packages"
if not exist "%PKG%" mkdir "%PKG%"

echo.
echo === Part 1. MSIX for the Microsoft Store ===
call :fetch msix.yml push "%PKG%" nosub
echo.
echo === Part 2. Windows exe, Android apk and aab ===
call :fetch build.yml %MODE% "%~dp0BlindHub-builds" sub
echo.
echo All done.
echo The MSIX is in: %PKG%
echo The exe, apk and aab are in: %~dp0BlindHub-builds
explorer "%PKG%"
pause
exit /b 0

:fetch
rem %1 workflow file, %2 push or dispatch, %3 target folder, %4 sub or nosub
setlocal
set "WF=%~1"
set "RUNID="
set /a TRIES=0
:f_find
set /a TRIES+=1
if "%~2"=="dispatch" (
  for /f %%R in ('gh run list --repo %REPO% --workflow %WF% --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId // empty" 2^>nul') do set "RUNID=%%R"
) else (
  for /f %%R in ('gh run list --repo %REPO% --workflow %WF% --commit %SHA% --limit 1 --json databaseId --jq ".[0].databaseId // empty" 2^>nul') do set "RUNID=%%R"
)
if "%~2"=="dispatch" if "%RUNID%"=="%OLDID%" set "RUNID="
if not "%RUNID%"=="" goto f_watch
if %TRIES% geq 30 goto f_norun
timeout /t 5 /nobreak >nul
goto f_find

:f_norun
echo Could not find the %WF% build yet. Open GitHub, Actions, to follow it. Run this file again later.
endlocal & exit /b 1

:f_watch
echo Build %RUNID% found. Watching until it finishes. This takes several minutes.
gh run watch %RUNID% --repo %REPO% --interval 15 --exit-status
if errorlevel 1 echo The build reported a problem. Downloading whatever was built.

set "DEST=%~3"
if "%~4"=="sub" set "DEST=%~3\run-%RUNID%"
if not exist "%DEST%" mkdir "%DEST%"
set "TMPD=%DEST%\_download"
if exist "%TMPD%" rd /s /q "%TMPD%"
gh run download %RUNID% --repo %REPO% --dir "%TMPD%"
if errorlevel 1 (
  echo Error. Nothing could be downloaded from the %WF% build.
  endlocal & exit /b 1
)
for /r "%TMPD%" %%F in (*.msix *.exe *.apk *.aab) do move /y "%%F" "%DEST%\" >nul
rd /s /q "%TMPD%"
echo Downloaded to %DEST%
dir /b "%DEST%"
endlocal & exit /b 0

:nogh
echo GitHub CLI is not installed or not logged in, so the files cannot be downloaded automatically.
echo Install gh from cli.github.com, run gh auth login, then run this file again.
echo Or find the files in GitHub, Actions, Artifacts.
pause
exit /b 0

:fail
echo Failed. Read the line above.
pause
exit /b 1
