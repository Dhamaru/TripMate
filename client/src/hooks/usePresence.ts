import { useEffect, useState } from "react";
import { useSocket } from "./useSocket";
import { useAuth } from "./useAuth";

export interface PresenceMember {
  userId: string;
  userName: string;
  avatar?: string;
  lastSeen: number;
}

/**
 * Join a trip's live room and track who else is viewing it. The room is
 * re-joined on every reconnect: a reconnect is a new server-side socket that
 * isn't in any room, so live updates used to stop silently after a deploy or
 * a phone waking up. `onReconnect` lets the page refetch what it missed.
 */
export const usePresence = (tripId: string, onReconnect?: () => void) => {
  const socketRef = useSocket();
  const { user } = useAuth();
  const [members, setMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !tripId || !user) return;

    const join = () => socket.emit("join-trip", { tripId });
    let joinedOnce = false;
    const onConnect = () => {
      join();
      if (joinedOnce) onReconnect?.();
      joinedOnce = true;
    };
    if (socket.connected) onConnect();
    socket.on("connect", onConnect);
    socket.on("presence-update", setMembers);

    return () => {
      socket.emit("leave-trip", { tripId });
      socket.off("connect", onConnect);
      socket.off("presence-update", setMembers);
    };
    // onReconnect is read when a reconnect happens; it needn't re-join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, user?.id, socketRef]);

  return { members };
};
