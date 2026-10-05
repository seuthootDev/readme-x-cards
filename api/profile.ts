import { profileCard, svgResponse } from '../src/cards.js';

export async function GET(request: Request): Promise<Response> {
  return svgResponse(await profileCard(new URL(request.url).searchParams));
}
