export type Message = { role: 'user' | 'assistant'; content: string };

export const sessionState = {
  imageUrl: null as string | null,
  messages: [] as Message[],
};
