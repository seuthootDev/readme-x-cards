import { feedCard, svgResponse } from '../src/cards.js';

export async function GET(request: Request): Promise<Response> {
  return svgResponse(await feedCard(new URL(request.url).searchParams));
}
