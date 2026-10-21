// violates: web-only-api-calls-network
// Only web/api/ may call the network; a feature goes through LoopsApi.
export async function load() { return (await fetch('/api/loops')).json(); }
