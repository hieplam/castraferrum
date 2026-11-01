// The checks of a groups file (spec 2.12, decision 21). `assemble` and `model-run` use the same checks.
export const CLUSTER_ID = /^[a-z0-9-]{1,40}$/;
const CHECK_KINDS = ['hook', 'lint', 'test', 'eval', 'probe'];

export const text = (x) => typeof x === 'string' && x.trim() !== '';
export const checkProblem = (c) => (CHECK_KINDS.includes(c?.kind) && text(c?.name) && text(c?.replay) ? null : 'check needs a kind, a name and a replay');

/** One message per problem of `groups` against the first pass. An empty list means that `assemble` accepts the groups. */
export function groupProblems(pass, groups) {
  const rest = new Map(pass.rest.map((e) => [e.id, e]));
  const ruled = new Set(pass.clusters.flatMap((c) => c.ids));
  const clusterIds = new Set(pass.clusters.map((c) => c.id));
  const grouped = new Set();
  const problems = [];
  groups.clusters.forEach((g, i) => {
    const name = `group ${i + 1} (${g?.id ?? 'no id'})`;
    if (!CLUSTER_ID.test(g?.id ?? '')) problems.push(`${name}: id must match ${CLUSTER_ID}`);
    else if (clusterIds.has(g.id)) problems.push(`${name}: repeated cluster id`);
    clusterIds.add(g?.id);
    if (!text(g?.cause)) problems.push(`${name}: needs a cause`);
    const checkBad = checkProblem(g?.check);
    if (checkBad) problems.push(`${name}: ${checkBad}`);
    if (!Array.isArray(g?.ids) || g.ids.length === 0) {
      problems.push(`${name}: needs at least one id`);
      return;
    }
    for (const id of g.ids) {
      if (ruled.has(id)) problems.push(`${name}: ${id} belongs to a rule cluster`);
      else if (!rest.has(id)) problems.push(`${name}: ${id} is not in rest`);
      else if (grouped.has(id)) problems.push(`${name}: ${id} is in two groups`);
      grouped.add(id);
    }
  });
  return problems;
}
