export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

export function wrap(v: number, min: number, max: number): number {
  const r = max - min
  return ((((v - min) % r) + r) % r) + min
}
