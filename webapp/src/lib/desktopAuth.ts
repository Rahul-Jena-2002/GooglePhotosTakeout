export async function sendDesktopAuth(port: string, payload: Record<string, string>): Promise<void> {
  if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535 || !payload.state || !payload.idToken) {
    throw new Error("Invalid desktop sign-in request.");
  }
  const response = await fetch(`http://127.0.0.1:${port}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("The desktop app rejected the sign-in request.");
}
