import profiles from './workflow/scene-profiles.json';
export type SceneProfiles=typeof profiles;
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const defaults=freeze(profiles);
let resolver:()=>SceneProfiles=()=>defaults;
/** Register a server execution-context resolver without importing server modules here. */
export function setSceneProfileResolver(next:()=>SceneProfiles){resolver=next;}
export function getSceneProfiles():SceneProfiles{return resolver();}
