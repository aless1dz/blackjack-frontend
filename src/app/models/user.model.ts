export interface User {
  id: number;
  email: string;
  fullName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  fullName: string;
  password: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: {
    type: string;
    value: string;
  };
}
