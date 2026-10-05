@echo off
setlocal
if exist "%~dp0runtime\java\bin\java.exe" (
  set "JAVA_HOME=%~dp0runtime\java"
  set "PATH=%~dp0runtime\java\bin;%PATH%"
)
call "%~dp0support\launch.bat" fg jdk Ghidra++ 2G "" ghidraplus.GhidraPlusPlus %*
endlocal
