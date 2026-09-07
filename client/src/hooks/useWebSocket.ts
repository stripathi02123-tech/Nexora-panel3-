import { useEffect, useCallback, useRef } from 'react';
import { connectSocket, disconnectSocket, joinRoom, leaveRoom, getSocket } from '@/utils/socket';
import { useAuth } from './useAuth';

export const useWebSocket = (
  room?: string,
  eventHandlers?: Record<string, (...args: any[]) => void>
) => {
  const { token } = useAuth();
  const handlersRef = useRef(eventHandlers);
  handlersRef.current = eventHandlers;

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    if (room) {
      joinRoom(room);
    }
    return () => {
      if (room) {
        leaveRoom(room);
      }
    };
  }, [token, room]);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket || !handlersRef.current) return;
    const entries = Object.entries(handlersRef.current);
    entries.forEach(([event, handler]) => {
      socket.on(event, handler);
    });
    return () => {
      entries.forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  }, [token]);

  const emit = useCallback((event: string, data?: any) => {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit(event, data);
    }
  }, []);

  return { emit, socket: getSocket() };
};
