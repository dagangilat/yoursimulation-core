// Example: generate an N-location data-network model and print JSON to stdout.
// Run: npx tsx generate-network.ts 100 > network-100.json
const locations = Number(process.argv[2] ?? 10);
const nodes: unknown[] = [
  { id: 'clients', type: 'source', label: 'Clients', position: { x: 0, y: 0 }, params: { interarrival: { dist: 'exp', mean: 0.05 } } },
  { id: 'backbone-q', type: 'queue', label: 'Backbone buffer', position: { x: 200, y: 0 }, params: { capacity: 500 } },
  { id: 'backbone', type: 'resource', label: 'Backbone router', position: { x: 400, y: 0 }, params: { servers: 16, service: { dist: 'exp', mean: 0.1 } } },
  { id: 'fanout', type: 'branch', label: 'Route to location', position: { x: 600, y: 0 }, params: {} },
  { id: 'served', type: 'sink', label: 'Served', position: { x: 1400, y: 0 }, params: {} },
];
const edges: unknown[] = [
  { id: 'e-c', from: 'clients', to: 'backbone-q' },
  { id: 'e-q', from: 'backbone-q', to: 'backbone' },
  { id: 'e-b', from: 'backbone', to: 'fanout' },
];
for (let i = 0; i < locations; i++) {
  const q = `loc${i}-q`, r = `loc${i}-router`;
  nodes.push({ id: q, type: 'queue', label: `Loc ${i} buffer`, position: { x: 800, y: i * 60 }, params: { capacity: 100 } });
  nodes.push({ id: r, type: 'resource', label: `Loc ${i} router`, position: { x: 1000, y: i * 60 }, params: { servers: 2, service: { dist: 'exp', mean: 0.5 } } });
  edges.push({ id: `e-f${i}`, from: 'fanout', to: q, probability: 1 / locations });
  edges.push({ id: `e-q${i}`, from: q, to: r });
  edges.push({ id: `e-r${i}`, from: r, to: 'served' });
}
process.stdout.write(JSON.stringify({ schemaVersion: 1, name: `Data network (${locations} locations)`, settings: { timeUnit: 'sec', horizon: 600, warmup: 60, replications: 10, seed: 42 }, presentation: { theme: 'network' }, nodes, edges }, null, 2));
