export interface Game {
  id: number;
  hostName?: string;
  status: 'waiting' | 'playing' | 'finished';
  maxPlayers: number;
  winnerId?: number;
  createdAt: string;
  updatedAt: string;
  players?: Player[];
}

export interface Player {
  id: number;
  gameId: number;
  userId: number;
  name?: string; // Nombre del jugador en el backend
  isHost: boolean | number; // Puede ser boolean o number (1/0)
  totalPoints?: number; // Puntos en el backend se llaman totalPoints
  points?: number; // Alias para totalPoints
  isStand?: boolean | number; // En el backend se llama isStand
  isStanding?: boolean; // Alias para isStand
  isFinished?: boolean;
  hasCardRequest?: boolean; // Nueva propiedad para solicitudes de carta
  position?: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: number;
    username?: string;
    fullName?: string;
    email: string;
  };
  cards?: PlayerCard[];
}

export interface PlayerCard {
  id: number;
  playerId: number;
  card: string;
  value: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameStatus {
  game: Game;
  players: Player[];
  currentPlayer?: Player;
  isFinished: boolean;
}

export interface CreateGameRequest {
  maxPlayers: number;
  hostName?: string;
}

export interface RematchResponse {
  playerId: number;
  accepted: boolean;
}

export interface GameInfo {
  game: Game;
  currentPlayers: number;
  maxPlayers: number;
  canStart: boolean;
  willAutoStart: boolean;
  playersNeeded: number;
  currentPlayerTurn?: number;
  winner?: Player;
}
