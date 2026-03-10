#!/bin/bash

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║   SISTEMA DE GESTIÓN DE MANTENIMIENTO                ║"
echo "║   Iniciando servicios...                             ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar si existe el entorno virtual
if [ ! -d "backend/venv" ]; then
    echo -e "${YELLOW}⚠️  ADVERTENCIA: Entorno virtual no encontrado${NC}"
    echo "Creando entorno virtual..."
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cd ..
    echo -e "${GREEN}✅ Entorno virtual creado${NC}"
    echo ""
fi

# Función para limpiar procesos al salir
cleanup() {
    echo -e "\n${YELLOW}🛑 Deteniendo servicios...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo -e "${GREEN}✅ Backend detenido${NC}"
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo -e "${GREEN}✅ Frontend detenido${NC}"
    fi
    if [ ! -z "$TUNNEL_PID" ]; then
        kill $TUNNEL_PID 2>/dev/null
        echo -e "${GREEN}✅ Túnel detenido${NC}"
    fi
    echo -e "${GREEN}👋 Sistema detenido correctamente${NC}"
    exit 0
}

# Registrar función de limpieza
trap cleanup EXIT INT TERM

echo -e "${BLUE}[1/3] 🔧 Iniciando Backend (API)...${NC}"
cd backend
source venv/bin/activate
python api.py > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..
sleep 3

# Verificar que el backend inició correctamente
if ps -p $BACKEND_PID > /dev/null; then
    echo -e "${GREEN}✅ Backend iniciado (PID: $BACKEND_PID)${NC}"
else
    echo -e "${RED}❌ Error al iniciar el backend. Revisa backend.log${NC}"
    exit 1
fi

echo -e "${BLUE}[2/3] 🌐 Iniciando Frontend (Aplicación Web)...${NC}"
cd frontend
BROWSER=none npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 5

if ps -p $FRONTEND_PID > /dev/null; then
    echo -e "${GREEN}✅ Frontend iniciado (PID: $FRONTEND_PID)${NC}"
else
    echo -e "${RED}❌ Error al iniciar el frontend. Revisa frontend.log${NC}"
    cleanup
    exit 1
fi

echo -e "${YELLOW}[3/3] ¿Deseas exponer a internet con Cloudflare Tunnel? (s/n)${NC}"
read -p "Respuesta: " TUNNEL

if [[ $TUNNEL == "s" || $TUNNEL == "S" ]]; then
    # Verificar si cloudflared está instalado
    if command -v cloudflared &> /dev/null; then
        echo -e "${BLUE}🌍 Iniciando Cloudflare Tunnel...${NC}"
        cloudflared tunnel --url http://localhost:3000 > tunnel.log 2>&1 &
        TUNNEL_PID=$!
        sleep 3
        
        # Obtener la URL del túnel
        TUNNEL_URL=$(grep -oP 'https://[^\s]+\.trycloudflare\.com' tunnel.log | head -1)
        
        if [ ! -z "$TUNNEL_URL" ]; then
            echo -e "${GREEN}✅ Túnel iniciado: $TUNNEL_URL${NC}"
        else
            echo -e "${YELLOW}⚠️  Túnel iniciado pero no se pudo obtener la URL. Revisa tunnel.log${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  cloudflared no está instalado. Omitiendo túnel.${NC}"
        echo -e "${YELLOW}   Instalar con: brew install cloudflare/cloudflare/cloudflared (Mac)${NC}"
        echo -e "${YELLOW}   O visita: https://github.com/cloudflare/cloudflared${NC}"
    fi
else
    echo -e "${BLUE}⏭️  Túnel omitido. Solo accesible en red local.${NC}"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ SISTEMA INICIADO CORRECTAMENTE                   ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📱 Acceso Local:${NC}"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend:  http://localhost:8000"
echo "   - API Docs: http://localhost:8000/docs"
echo ""
echo -e "${BLUE}🌐 Acceso en Red Local:${NC}"
echo "   - Encuentra tu IP con: ifconfig o ip addr show"
echo "   - Usa: http://TU_IP:3000"
echo ""

if [ ! -z "$TUNNEL_URL" ]; then
    echo -e "${BLUE}🌍 Acceso Público (Cloudflare Tunnel):${NC}"
    echo "   - $TUNNEL_URL"
    echo ""
fi

echo -e "${YELLOW}💡 IMPORTANTE:${NC}"
echo "   - NO CIERRES ESTA TERMINAL"
echo "   - Los logs se guardan en backend.log, frontend.log y tunnel.log"
echo "   - Para detener: presiona Ctrl+C"
echo ""

# Abrir navegador automáticamente (opcional)
echo -e "${YELLOW}¿Abrir navegador automáticamente? (s/n)${NC}"
read -p "Respuesta: " OPEN_BROWSER

if [[ $OPEN_BROWSER == "s" || $OPEN_BROWSER == "S" ]]; then
    # Detectar el sistema operativo y abrir el navegador
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open http://localhost:3000
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        xdg-open http://localhost:3000 2>/dev/null || sensible-browser http://localhost:3000 2>/dev/null
    fi
    echo -e "${GREEN}✅ Navegador abierto${NC}"
fi

echo ""
echo -e "${GREEN}Sistema en ejecución... Presiona Ctrl+C para detener${NC}"
echo ""

# Mantener el script corriendo
while true; do
    # Verificar que los procesos sigan corriendo
    if ! ps -p $BACKEND_PID > /dev/null; then
        echo -e "${RED}❌ El backend se detuvo inesperadamente${NC}"
        cleanup
        exit 1
    fi
    
    if ! ps -p $FRONTEND_PID > /dev/null; then
        echo -e "${RED}❌ El frontend se detuvo inesperadamente${NC}"
        cleanup
        exit 1
    fi
    
    sleep 5
done
