import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const connectSocket = (token: string): Socket => {
  if (socket?.connected) return socket;

  socket = io('/', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => console.log('WebSocket connected'));
  socket.on('disconnect', (reason) => console.log('WebSocket disconnected:', reason));
  socket.on('connect_error', (error) => console.error('WebSocket connection error:', error.message));

  return socket;
};

export const disconnectSocket = (): void => {
  socket?.disconnect();
  socket = null;
};

function emitRoomEvent(action: 'subscribe' | 'unsubscribe', room: string): void {
  if (!socket?.connected) return;

  const separator = room.indexOf(':');
  if (separator <= 0) {
    console.warn(`Unsupported Socket.IO room format: ${room}`);
    return;
  }

  const kind = room.slice(0, separator);
  const id = room.slice(separator + 1);
  if (!id) return;

  const supported = ['node', 'vm', 'container', 'user'] as const;
  if (!(supported as readonly string[]).includes(kind)) {
    console.warn(`Unsupported Socket.IO room type: ${kind}`);
    return;
  }

  socket.emit(`${action}:${kind}`, id);
}

export const joinRoom = (room: string): void => emitRoomEvent('subscribe', room);
export const leaveRoom = (room: string): void => emitRoomEvent('unsubscribe', room);

export const subscribeNode = (nodeId: string): void => {
  if (socket?.connected) socket.emit('subscribe:node', nodeId);
};

export const unsubscribeNode = (nodeId: string): void => {
  if (socket?.connected) socket.emit('unsubscribe:node', nodeId);
};

export const subscribeVm = (vmId: string): void => {
  if (socket?.connected) socket.emit('subscribe:vm', vmId);
};

export const unsubscribeVm = (vmId: string): void => {
  if (socket?.connected) socket.emit('unsubscribe:vm', vmId);
};

export const subscribeContainer = (containerId: string): void => {
  if (socket?.connected) socket.emit('subscribe:container', containerId);
};

export const unsubscribeContainer = (containerId: string): void => {
  if (socket?.connected) socket.emit('unsubscribe:container', containerId);
};

export const subscribeUser = (userId: string): void => {
  if (socket?.connected) socket.emit('subscribe:user', userId);
};

export const unsubscribeUser = (userId: string): void => {
  if (socket?.connected) socket.emit('unsubscribe:user', userId);
};

export const getSocket = (): Socket | null => socket;
