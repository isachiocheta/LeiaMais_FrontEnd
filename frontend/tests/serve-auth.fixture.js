import { createPassportFixture } from './fixtures/passport-app.js';

const fixture = await createPassportFixture();
const server = fixture.app.listen(3101, '127.0.0.1', () => console.info('Fixture isolada de Passport disponível em http://localhost:3101.'));
async function close() {
  server.closeAllConnections();
  server.close();
  await fixture.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
