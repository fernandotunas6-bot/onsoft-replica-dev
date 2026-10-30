/** "3" → "Sala 3"; nomes que já dizem o que são ("Sala 3", "Laboratório") ficam. */
export function roomLabel(room: string) {
  return /^\d+[A-Za-z]?$/.test(room.trim()) ? `Sala ${room.trim()}` : room.trim();
}
