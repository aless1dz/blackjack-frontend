# Blackjack Frontend

Este es el frontend de Angular 20 para el juego de Blackjack multiplayer.

## Estructura del Proyecto

```
src/
  app/
    components/
      auth/
        login/
        register/
      lobby/
      game/
    services/
      auth.service.ts
      game.service.ts
      socket.service.ts
    models/
      user.model.ts
      game.model.ts
    guards/
      auth.guard.ts
```

## Características

- ✅ Autenticación JWT
- ✅ Comunicación en tiempo real con Socket.IO
- ✅ Interfaz de lobby para juegos disponibles
- ✅ Mesa de blackjack interactiva
- ✅ Gestión de usuarios y salas
- ✅ Responsive design

## Comandos

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm start

# Compilar para producción
npm run build

# Ejecutar tests
npm test
```

## Configuración

El frontend está configurado para conectarse al backend en:
- API: http://localhost:3333/api
- Socket.IO: http://localhost:3333

## Uso

1. **Login/Registro**: Los usuarios pueden crear una cuenta o iniciar sesión
2. **Lobby**: Ver juegos disponibles y crear nuevos juegos
3. **Juego**: Jugar blackjack en tiempo real con otros jugadores
4. **Revancha**: Sistema de revancha al final de cada juego

## Tecnologías

- Angular 20
- TypeScript
- Socket.IO Client
- SCSS
- RxJS
