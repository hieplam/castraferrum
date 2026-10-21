// Valid: the HTTP implementation, the only place allowed to call the network.
import type { LoopsApi } from './loops-api';
export class HttpLoopsApi implements LoopsApi { async now() { return (await fetch('/api/t')).json(); } }
