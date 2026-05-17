@echo off
setlocal EnableExtensions

rem Solo-author commit — run after EACH fix or feature slice, then continue work.
rem Author: Avashik (from git config). No co-authors.
rem Usage:
rem   commit.bat "fix: short message"
rem   commit.bat "feat: short message" --no-push

cd /d "%~dp0"

set "COMMIT_MSG="
set "NO_PUSH=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--no-push" (
  set "NO_PUSH=1"
  shift
  goto parse_args
)
if not defined COMMIT_MSG (
  set "COMMIT_MSG=%~1"
  shift
  goto parse_args
)
shift
goto parse_args

:args_done
if not defined COMMIT_MSG (
  echo Usage: commit.bat "fix: short commit message" [--no-push]
  echo.
  echo Commit mid-process after each milestone, then keep coding.
  exit /b 1
)

echo.
echo [commit] Milestone: %COMMIT_MSG%
echo.

git add .
if errorlevel 1 exit /b %ERRORLEVEL%

git diff --cached --quiet
if %ERRORLEVEL%==0 (
  echo [commit] No changes to commit. Skipping.
  exit /b 0
)

git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
  echo [commit] FAILED — fix the issue above, then run commit.bat again with the same message.
  exit /b %ERRORLEVEL%
)

for /f "delims=" %%H in ('git rev-parse --short HEAD') do echo [commit] Created %%H — %COMMIT_MSG%

if "%NO_PUSH%"=="1" (
  echo [commit] Skipped push ^(--no-push^).
  exit /b 0
)

git push origin main
if errorlevel 1 (
  echo [commit] Push FAILED — commit exists locally. Fix auth/network, then run: git push origin main
  exit /b %ERRORLEVEL%
)

echo [commit] Pushed to origin/main. Continue with the next task.
echo.
exit /b 0
