const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export function isLightSquare(file: string, rank: number): boolean {
  const fileIndex = FILES.indexOf(file as typeof FILES[number]);
  return (fileIndex + rank) % 2 === 1;
}
