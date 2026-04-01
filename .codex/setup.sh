#!/bin/bash
set -e

echo "==> Instalando dependencias del frontend..."
cd frontend
npm install --legacy-peer-deps
cd ..

echo "==> Instalando dependencias del backend..."
cd backend
pip install -r requirements.txt --quiet
cd ..

echo "==> Setup completo ✅"
