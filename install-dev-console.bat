@echo off
echo 🛠️ Setting up Developer Console for Buddy Voice Assistant...
echo.

echo Step 1: Installing Firebase dependency...
npm install firebase

echo.
echo Step 2: Checking installation...
npm list firebase

echo.
echo ✅ Installation complete!
echo.
echo 🚀 To access the Developer Console:
echo   1. Start the app: npm start
echo   2. Navigate to: http://localhost:3000/dev
echo   3. Login with your admin password
echo.
echo 📖 See DEV_CONSOLE_SETUP.md for detailed documentation
echo.
pause
