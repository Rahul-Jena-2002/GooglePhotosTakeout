export async function checkAssessmentRateLimit(request: Request, limiter?: { limit: (options: { key: string }) => Promise<{ success: boolean }> }): Promise<number> {
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (!clientIp || !limiter) return 503;
  try {
    return (await limiter.limit({ key: clientIp })).success ? 200 : 429;
  } catch {
    return 503;
  }
}
