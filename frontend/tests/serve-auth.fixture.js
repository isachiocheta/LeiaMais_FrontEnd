import { createPassportFixture } from './fixtures/passport-app.js';
import { createCatalogConnection } from './fixtures/catalog-data.js';
import { createCycleConnection } from './fixtures/cycle-data.js';

const catalogConnection = createCatalogConnection();
const fixture = await createPassportFixture({ catalogConnection, cycleConnection: createCycleConnection({ catalogConnection, writable: true }) });
const server = fixture.app.listen(3101, '127.0.0.1', () => console.info('Fixture isolada de Passport disponível em http://localhost:3101.'));
async function close() {
  server.closeAllConnections();
  server.close();
  await fixture.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
