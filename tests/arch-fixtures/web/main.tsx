// Valid: the UI composition root creates the implementations.
import { HttpLoopsApi } from './api/http-loops-api';
import { App } from './app/App';
export const root = { api: new HttpLoopsApi(), App };
