import { postCard, svgResponse } from '../src/cards.js';

export async function GET(request: Request): Promise<Response> {
  return svgResponse(await postCard(new URL(request.url).searchParams));
}
