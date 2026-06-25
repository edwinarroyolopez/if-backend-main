import { createTestContext } from '../app-test-context';

export async function expectAuthRateLimitWithoutUserLeak() {
  const context = await createTestContext();

  try {
    let lastResponse = null as Awaited<
      ReturnType<typeof context.http.post>
    > | null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      lastResponse = await context.http.post('/api/v1/auth/native/login').send({
        email: 'missing-user@test.dev',
        password: 'WrongPassword123!',
      });
    }

    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.body.reasonCode).toBe('AUTH_RATE_LIMITED');
    expect(typeof lastResponse?.body.requestId).toBe('string');
    expect(JSON.stringify(lastResponse?.body)).not.toContain(
      'missing-user@test.dev',
    );
  } finally {
    await context.close();
  }
}
