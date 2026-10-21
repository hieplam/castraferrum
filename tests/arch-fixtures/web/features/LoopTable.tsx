// Valid: a feature uses data + ui + the API interface.
import type { LoopsApi } from '../api/loops-api';
import { useNow } from '../data/use-now';
import { Button } from '../ui/Button';
export function LoopTable(props: { api: LoopsApi }) { void useNow(props.api); return <Button label="ok" />; }
