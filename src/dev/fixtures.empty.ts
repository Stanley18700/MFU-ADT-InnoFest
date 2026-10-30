// Production stand-in for ./fixtures.ts: the fixture branches are dead code in a real build, and
// this keeps the sample data out of the bundle entirely.
export const FX = { as: 'anon', points: 0, redeemed: '' } as const
export function fxRows(_path: string): Array<Record<string, unknown> & { id: string }> { return [] }
export function fxDoc(_path: string): (Record<string, unknown> & { id: string }) | null { return null }
export const fxUser: unknown = null
export async function fxCall(_name: string, _data: unknown): Promise<unknown> { return null }
