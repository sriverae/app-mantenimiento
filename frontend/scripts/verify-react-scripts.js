#!/usr/bin/env node

try {
  require.resolve('react-scripts/package.json');
} catch (error) {
  console.error('\n❌ No se encontró "react-scripts" en node_modules.\n');
  console.error('Antes de ejecutar start/build/test, instala dependencias en frontend:');
  console.error('   npm install\n');
  process.exit(1);
}
