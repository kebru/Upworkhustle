export function extractUpworkJobId(input: string): string | undefined {
  const match = input.match(/~(\d{10,})/);
  return match?.[1];
}
