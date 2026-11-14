@echo off
setlocal
cd /d "%~dp0"
set "REPO=smartboyhacker66-stack/blind-"

echo ================================================
echo  Blind Hub: upload your code to GitHub
echo ================================================
echo.
echo Step 1 of 4: checking Git
where git >nul 2>&1
if errorlevel 1 goto nogit

echo Step 2 of 4: release key (only the first time)
if exist upload.jks goto haskey
where keytool >nul 2>&1
if errorlevel 1 goto nojava
echo   Creating a new release key. Please wait.
for /f %%P in ('powershell -NoProfile -Command "-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 20 | ForEach-Object {[char]$_})"') do set "PASS=%%P"
keytool -genkeypair -keystore upload.jks -alias blindhub -keyalg RSA -keysize 2048 -validity 10000 -storepass %PASS% -keypass %PASS% -dname "CN=Blind Indian Tech Support, O=Blind Indian Tech Support, C=IN" >nul 2>&1
if errorlevel 1 goto keyfail
certutil -encode -f upload.jks upload_b64.tmp >nul
findstr /v /c:"-----" upload_b64.tmp > keystore_base64.txt
del upload_b64.tmp
> keystore_info.txt echo KEYSTORE_PASSWORD=%PASS%
>> keystore_info.txt echo KEY_PASSWORD=%PASS%
>> keystore_info.txt echo KEY_ALIAS=blindhub
echo   Key created. Keep upload.jks and keystore_info.txt safe. They are NOT uploaded to GitHub.
:haskey
echo   Key ready.
echo.

echo Step 3 of 4: saving your changes
git init -q
git -c core.autocrlf=false -c core.safecrlf=false add .
git config user.name >nul 2>&1 || git config user.name "BlindHub"
git config user.email >nul 2>&1 || git config user.email "blindhub@users.noreply.github.com"
git commit -q -m "Blind Hub update" >nul 2>&1
git branch -M main
git remote remove origin >nul 2>&1
git remote add origin https://github.com/%REPO%.git
echo   Changes saved.
echo.

echo Step 4 of 4: uploading to GitHub (this may take a minute)
git push -q -u origin main --force
if errorlevel 1 goto pushfail
echo.
echo ================================================
echo  SUCCESS. Your code is on GitHub.
echo  The app builds by itself now.
echo  Waiting for the build. Files will download here automatically.
echo  Bonus tip: go and drink some chai. You earned it.
echo ================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0get-builds.ps1"
goto end

:nogit
echo ERROR: Git is not installed. Install Git for Windows, then run this again.
goto end
:nojava
echo ERROR: Java is not installed. Install JDK 17, then run this again.
goto end
:keyfail
echo ERROR: Could not create the release key. Check Java and try again.
goto end
:pushfail
echo ERROR: Upload failed. Check your GitHub login and internet, then run again.
goto end
:end
echo.
pause
