@echo off
setlocal

set "VS_DEV_CMD=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\Common7\Tools\VsDevCmd.bat"
if not exist "%VS_DEV_CMD%" (
    echo Visual Studio 2019 Build Tools were not found.
    exit /b 1
)

call "%VS_DEV_CMD%" -arch=x64 -host_arch=x64 >nul
if errorlevel 1 exit /b %errorlevel%

set "ROOT=%~dp0.."
set "OUT=%ROOT%\out\msvc"
if not exist "%OUT%" mkdir "%OUT%"

set "COMMON=/nologo /std:c++latest /EHsc /W4 /WX /permissive- /Zc:preprocessor /I "%ROOT%\include""
set "CORE=%ROOT%\source\engine\core\fixed_step_clock.cpp %ROOT%\source\engine\core\log.cpp %ROOT%\source\engine\core\uuid.cpp"
set "PLATFORM=%ROOT%\source\engine\platform\headless_platform.cpp"
set "RUNTIME=%ROOT%\source\engine\runtime\application.cpp"

cl %COMMON% /Fe:"%OUT%\engine_host.exe" %CORE% %PLATFORM% %RUNTIME% "%ROOT%\apps\engine_host\main.cpp"
if errorlevel 1 exit /b %errorlevel%

cl %COMMON% /Fe:"%OUT%\engine_core_tests.exe" %CORE% "%ROOT%\tests\core_tests.cpp"
if errorlevel 1 exit /b %errorlevel%

"%OUT%\engine_core_tests.exe"
if errorlevel 1 exit /b %errorlevel%

cl %COMMON% /Fe:"%OUT%\engine_runtime_tests.exe" %CORE% %PLATFORM% %RUNTIME% "%ROOT%\tests\runtime_tests.cpp"
if errorlevel 1 exit /b %errorlevel%

"%OUT%\engine_runtime_tests.exe"
if errorlevel 1 exit /b %errorlevel%

"%OUT%\engine_host.exe"
exit /b %errorlevel%
