// Compare all documented result fields; finder bookkeeping is internal to TypeScript.
export const publicResult = r => r && ({...r, location: Object.fromEntries(Object.entries(r.location).map(([key,p]) => [key,p && {x:p.x,y:p.y}]))})
