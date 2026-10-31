/** Explicit registered bot-pair exception to the Gen7 OU same-IP match check. */
export function allowSameIPBotMatch(
 format: string, users: readonly { id: string; registered: boolean }[], configured: unknown
): boolean {
 if (format !== 'gen7ou' || users.length !== 2 || !Array.isArray(configured)) return false;
 const ids = new Set(configured.filter((name): name is string => typeof name === 'string')
  .map(name => name.toLowerCase().replace(/[^a-z0-9]/g, '')));
 return users[0].id !== users[1].id && users.every(user => user.registered && ids.has(user.id));
}
