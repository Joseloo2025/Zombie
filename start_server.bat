@echo off
:: Verifica y solicita permisos de administrador
if not "%1"=="am_admin" (  
    powershell start -verb runas '%0' am_admin  
    exit /b  
)  

:: Cambia al directorio del proyecto y ejecuta el servidor Node.js
powershell -NoExit -Command "cd D:\Proyectos\zombies; node server.js"  

:: Al cerrar la ventana, PowerShell y Node.js se terminan automáticamente