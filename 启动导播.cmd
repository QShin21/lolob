@echo off
setlocal
"%SystemRoot%\System32\wscript.exe" //nologo "%~dpn0.vbs" %*
endlocal
